from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction as db_transaction

import csv
from typing import Iterable, Optional, List

from web3 import Web3

from nft.models import NFT, Transaction
from nft.web3_utils import web3_instance


class Command(BaseCommand):
    help = (
        "Import genuine on-chain sales by tx hash list or CSV export.\n"
        "Decodes NFTSold(tokenId,seller,buyer,price) from receipts.\n"
        "Falls back to ERC721 Transfer and tx.value when needed."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--tx', type=str, default=None,
            help='Comma-separated transaction hashes to import'
        )
        parser.add_argument(
            '--csv', dest='csv_path', type=str, default=None,
            help='Path to Etherscan CSV; imports only rows with Method == "Buy NFT"'
        )
        parser.add_argument('--dry-run', action='store_true', help='Simulate without DB writes')

    def handle(self, *args, **options):
        dry_run: bool = options['dry_run']
        tx_arg: Optional[str] = options.get('tx')
        csv_path: Optional[str] = options.get('csv_path')

        if not tx_arg and not csv_path:
            self.stderr.write(self.style.ERROR('Provide --tx or --csv'))
            return

        tx_hashes: List[str] = []
        if tx_arg:
            tx_hashes.extend([h.strip() for h in tx_arg.split(',') if h.strip()])

        if csv_path:
            try:
                with open(csv_path, newline='') as f:
                    reader = csv.DictReader(f, skipinitialspace=True)
                    for row in reader:
                        # Normalize keys to be resilient to stray spaces/casing
                        norm = { (k or '').strip(): (v or '').strip() for k, v in row.items() }
                        method = norm.get('Method', '')
                        if method.lower().startswith('buy'):
                            h = norm.get('Transaction Hash', '')
                            if h:
                                tx_hashes.append(h)
            except Exception as e:
                self.stderr.write(self.style.ERROR(f'Failed to read CSV: {e}'))
                return

        if not tx_hashes:
            self.stdout.write('No transactions to import')
            return

        w3 = web3_instance.w3
        topic_sold = Web3.keccak(text="NFTSold(uint256,address,address,uint256)").hex()
        topic_transfer = Web3.keccak(text="Transfer(address,address,uint256)").hex()

        processed = 0
        created = 0

        for h in tx_hashes:
            processed += 1
            try:
                receipt = w3.eth.get_transaction_receipt(h)
                logs = receipt.get('logs', [])

                token_id = None
                seller = None
                buyer = None
                price_eth = None
                block_number = receipt.get('blockNumber')

                # First try NFTSold (topics: [sold, tokenId, seller, buyer])
                for lg in logs:
                    if lg.get('address', '').lower() == web3_instance.contract_address.lower() and lg['topics']:
                        if lg['topics'][0].hex().lower() == topic_sold.lower():
                            token_id = int(Web3.to_int(hexstr=lg['topics'][1].hex()))
                            seller = Web3.to_checksum_address('0x' + lg['topics'][2].hex()[-40:])
                            buyer = Web3.to_checksum_address('0x' + lg['topics'][3].hex()[-40:])
                            # price is in data (uint256)
                            price_wei = Web3.to_int(hexstr=lg.get('data', '0x0'))
                            price_eth = w3.from_wei(price_wei, 'ether')
                            break

                # Fallback: Transfer + tx.value
                if token_id is None:
                    for lg in logs:
                        if lg.get('topics') and lg['topics'][0].hex().lower() == topic_transfer.lower():
                            # This could be ERC721 transfer
                            if len(lg['topics']) >= 4:
                                seller = Web3.to_checksum_address('0x' + lg['topics'][1].hex()[-40:])
                                buyer = Web3.to_checksum_address('0x' + lg['topics'][2].hex()[-40:])
                                token_id = int(Web3.to_int(hexstr=lg['topics'][3].hex()))
                                try:
                                    tx = w3.eth.get_transaction(h)
                                    price_eth = w3.from_wei(tx.get('value', 0), 'ether')
                                except Exception:
                                    price_eth = 0
                                break

                if token_id is None:
                    self.stderr.write(self.style.ERROR(f"{h}: Could not decode tokenId; skipping"))
                    continue

                nft = NFT.objects.filter(token_id=token_id).first()
                if not nft:
                    self.stdout.write(f"ℹ️  {h}: token {token_id} not found in DB; skipping")
                    continue

                if Transaction.objects.filter(transaction_hash=h).exists():
                    self.stdout.write(f"ℹ️  {h}: already imported; skipping")
                    continue

                if dry_run:
                    self.stdout.write(f"🔍 Would create sale for token {token_id} price {price_eth} (buyer {buyer})")
                    continue

                with db_transaction.atomic():
                    Transaction.objects.create(
                        transaction_hash=h,
                        nft=nft,
                        from_address=seller or '',
                        to_address=buyer or '',
                        transaction_type='buy',
                        price=price_eth or 0,
                        block_number=block_number or 0,
                        gas_used=0,
                        gas_price=0,
                        timestamp=timezone.now(),
                    )
                    created += 1
                    if buyer:
                        nft.owner_address = buyer
                    nft.is_listed = False
                    nft.save(update_fields=['owner_address', 'is_listed'])

            except Exception as e:
                self.stderr.write(self.style.ERROR(f"{h}: error {e}"))

        if dry_run:
            self.stdout.write(f"🔍 Dry run complete. Would create {created} sales from {processed} txs.")
        else:
            self.stdout.write(self.style.SUCCESS(f"✅ Import complete. Created {created} sales from {processed} txs."))


