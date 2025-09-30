from django.core.management.base import BaseCommand
from django.utils import timezone
from typing import List, Optional

from nft.models import NFT, Transaction


class Command(BaseCommand):
    help = (
        "Backfill missing sale Transactions so stats like Last Sale and Total Volume populate.\n"
        "Creates a single 'buy' Transaction for NFTs that currently have no buy/sale transactions."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--token-ids',
            type=str,
            help='Comma-separated list of token IDs to backfill. If omitted, processes all NFTs.'
        )
        parser.add_argument(
            '--default-price',
            type=float,
            default=0.02,
            help='Price in ETH to use for backfilled sales when not specified.'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be created without writing to the database.'
        )

    def handle(self, *args, **options):
        token_ids_arg: Optional[str] = options.get('token_ids')
        default_price: float = options.get('default_price')
        dry_run: bool = options.get('dry_run')

        token_ids: Optional[List[int]] = None
        if token_ids_arg:
            try:
                token_ids = [int(t.strip()) for t in token_ids_arg.split(',') if t.strip()]
            except ValueError:
                self.stderr.write(self.style.ERROR('Invalid --token-ids format. Use comma-separated integers.'))
                return

        nfts_qs = NFT.objects.all()
        if token_ids:
            nfts_qs = nfts_qs.filter(token_id__in=token_ids)

        processed = 0
        created = 0

        self.stdout.write(
            f"Starting backfill_sales for {nfts_qs.count()} NFTs (dry_run={dry_run}, default_price={default_price})"
        )

        for nft in nfts_qs:
            processed += 1
            try:
                existing_sales = Transaction.objects.filter(
                    nft=nft,
                    transaction_type__in=['buy', 'sale']
                )

                if existing_sales.exists():
                    self.stdout.write(f"✅ Token {nft.token_id}: already has {existing_sales.count()} sale tx(s), skipping")
                    continue

                # Use current owner as buyer; old owner unknown – set from_address empty
                tx_data = dict(
                    transaction_hash=f"backfill_{nft.token_id}_{int(timezone.now().timestamp())}",
                    nft=nft,
                    from_address=nft.creator_address or '',
                    to_address=nft.owner_address or '',
                    transaction_type='buy',
                    price=default_price,
                    block_number=0,
                    gas_used=0,
                    gas_price=0,
                    timestamp=timezone.now(),
                )

                if dry_run:
                    self.stdout.write(f"🔍 Would create sale tx for token {nft.token_id} at price {default_price}")
                else:
                    Transaction.objects.create(**tx_data)
                    created += 1
                    self.stdout.write(self.style.SUCCESS(
                        f"🧾 Created sale tx for token {nft.token_id} at price {default_price}"
                    ))

            except Exception as e:
                self.stderr.write(self.style.ERROR(f"❌ Error processing token {nft.token_id}: {e}"))

        if dry_run:
            self.stdout.write(f"🔍 Dry run complete. Would create {created} transactions out of {processed} NFTs.")
        else:
            self.stdout.write(self.style.SUCCESS(
                f"✅ Backfill complete. Created {created} transactions out of {processed} NFTs."
            ))


