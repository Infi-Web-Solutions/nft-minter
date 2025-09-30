from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction as db_transaction

from nft.models import NFT, Transaction
from nft.web3_utils import web3_instance
from web3 import Web3


class Command(BaseCommand):
    help = (
        "Backfill missing buy/sale Transactions by reading on-chain events for all NFTs in DB.\n"
        "If a token has an on-chain sale and no corresponding local sale, a Transaction will be created."
    )

    def add_arguments(self, parser):
        parser.add_argument('--from-block', type=int, default=None, help='Start block (optional)')
        parser.add_argument('--to-block', type=int, default=None, help='End block (optional)')
        parser.add_argument('--from-deploy', action='store_true', help='Auto-detect contract deployment block for start')
        parser.add_argument('--to-head', action='store_true', help='Use current head block for end')
        parser.add_argument('--dry-run', action='store_true', help='Simulate without DB writes')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        from_block = options['from_block']
        to_block = options['to_block']
        from_deploy = options.get('from_deploy')
        to_head = options.get('to_head')

        w3 = web3_instance.w3
        contract = web3_instance.contract

        if to_head or to_block is None:
            to_block = w3.eth.block_number
        if from_deploy:
            def has_code_at(block_number: int) -> bool:
                try:
                    code = w3.eth.get_code(web3_instance.contract_address, block_identifier=block_number)
                    return code and code.hex() != '0x'
                except Exception:
                    return False

            # Binary search for first block where code appears
            lo = 0
            hi = to_block
            first = None
            while lo <= hi:
                mid = (lo + hi) // 2
                if has_code_at(mid):
                    first = mid
                    hi = mid - 1
                else:
                    lo = mid + 1
            if first is not None:
                from_block = first
                self.stdout.write(f"Detected deployment block: {from_block}")
            else:
                self.stdout.write("Could not detect deployment block; falling back to default range")

        if from_block is None:
            # Default to last 250k blocks (~1-2 months on Sepolia); adjust as needed
            from_block = max(0, to_block - 250000)

        self.stdout.write(f"Scanning events from block {from_block} to {to_block} (dry_run={dry_run})")

        # Contract must emit NFTSold(tokenId, seller, buyer, price)
        try:
            event = contract.events.NFTSold
        except Exception:
            self.stderr.write(self.style.ERROR('Contract does not expose NFTSold event in ABI.'))
            return

        # Provider-friendly recursive log fetcher with explicit address/topic filtering
        topic0 = Web3.keccak(text="NFTSold(uint256,address,address,uint256)").hex()

        logs = []

        def fetch_logs_range(start_block: int, end_block: int):
            if start_block > end_block:
                return
            params = {
                'address': web3_instance.contract_address,
                'fromBlock': start_block,
                'toBlock': end_block,
                'topics': [topic0],
            }
            try:
                entries = w3.eth.get_logs(params)
                logs.extend(entries)
                self.stdout.write(f"Fetched {len(entries)} events for range {start_block}-{end_block}")
            except Exception as e:
                # On provider range limitation (often 400), split range and retry
                if end_block - start_block > 64:
                    mid = (start_block + end_block) // 2
                    fetch_logs_range(start_block, mid)
                    fetch_logs_range(mid + 1, end_block)
                else:
                    self.stderr.write(self.style.ERROR(f"Failed to fetch logs for small range {start_block}-{end_block}: {e}"))

        fetch_logs_range(from_block, to_block)

        self.stdout.write(f"Found {len(logs)} NFTSold events in range")

        created = 0
        processed = 0
        for evt in logs:
            processed += 1
            try:
                token_id = int(evt['args']['tokenId'])
                seller = evt['args']['seller']
                buyer = evt['args']['buyer']
                price_wei = int(evt['args']['price'])
                price_eth = web3_instance.w3.from_wei(price_wei, 'ether')
                block_number = evt['blockNumber']
                tx_hash = evt['transactionHash'].hex()

                nft = NFT.objects.filter(token_id=token_id).first()
                if not nft:
                    self.stdout.write(f"ℹ️  Skipping token {token_id}: not in local DB")
                    continue

                # Skip only if this exact transaction already exists locally
                if Transaction.objects.filter(transaction_hash=tx_hash).exists():
                    continue

                if dry_run:
                    self.stdout.write(f"🔍 Would create sale tx for token {token_id} price {price_eth} (buyer {buyer})")
                    continue

                with db_transaction.atomic():
                    Transaction.objects.create(
                        transaction_hash=tx_hash,
                        nft=nft,
                        from_address=seller,
                        to_address=buyer,
                        transaction_type='buy',
                        price=price_eth,
                        block_number=block_number,
                        gas_used=0,
                        gas_price=0,
                        timestamp=timezone.now(),
                    )
                    created += 1
                    # Also ensure DB reflects ownership and delists
                    nft.owner_address = buyer
                    nft.is_listed = False
                    nft.save(update_fields=['owner_address', 'is_listed'])

            except Exception as e:
                self.stderr.write(self.style.ERROR(f"Error processing event: {e}"))

        if dry_run:
            self.stdout.write(f"🔍 Dry run complete. Would create {created} sales from {processed} events.")
        else:
            self.stdout.write(self.style.SUCCESS(f"✅ Backfill complete. Created {created} sales from {processed} events."))


