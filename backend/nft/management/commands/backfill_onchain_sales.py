from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction as db_transaction

from nft.models import NFT, Transaction
from nft.web3_utils import web3_instance


class Command(BaseCommand):
    help = (
        "Backfill missing buy/sale Transactions by reading on-chain events for all NFTs in DB.\n"
        "If a token has an on-chain sale and no corresponding local sale, a Transaction will be created."
    )

    def add_arguments(self, parser):
        parser.add_argument('--from-block', type=int, default=None, help='Start block (optional)')
        parser.add_argument('--to-block', type=int, default=None, help='End block (optional)')
        parser.add_argument('--dry-run', action='store_true', help='Simulate without DB writes')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        from_block = options['from_block']
        to_block = options['to_block']

        w3 = web3_instance.w3
        contract = web3_instance.contract

        if to_block is None:
            to_block = w3.eth.block_number
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

        # Fetch logs in batches to avoid provider limits
        batch_size = 5000
        logs = []
        start = from_block
        while start <= to_block:
            end = min(start + batch_size - 1, to_block)
            try:
                # web3.py v6
                part = event().get_logs(from_block=start, to_block=end)
            except TypeError:
                try:
                    # web3.py v5
                    part = event().get_logs(fromBlock=start, toBlock=end)
                except Exception:
                    # Fallback: filter API
                    evt_filter = event().create_filter(fromBlock=start, toBlock=end)
                    part = evt_filter.get_all_entries()
            except Exception as e:
                # If provider complains (e.g., 400), reduce batch and retry
                if batch_size > 500:
                    batch_size = batch_size // 2
                    self.stdout.write(f"Provider error ({e}). Reducing batch_size to {batch_size} and retrying from {start}.")
                    continue
                else:
                    self.stderr.write(self.style.ERROR(f"Failed to fetch logs for range {start}-{end}: {e}"))
                    start = end + 1
                    continue

            logs.extend(part)
            self.stdout.write(f"Fetched {len(part)} events for range {start}-{end}")
            start = end + 1

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

                has_sale = Transaction.objects.filter(
                    nft=nft,
                    transaction_type__in=['buy', 'sale'],
                ).exists()
                if has_sale:
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


