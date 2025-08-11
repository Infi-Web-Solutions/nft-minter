from django.core.management.base import BaseCommand
from nft.models import NFT, Transaction, Favorite

class Command(BaseCommand):
    help = 'Remove all dummy NFTs from the database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be deleted without actually deleting',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        # Find all dummy NFTs
        dummy_nfts = NFT.objects.filter(
            name__startswith='Cool NFT #'
        ) | NFT.objects.filter(
            name__startswith='Test NFT #'
        ) | NFT.objects.filter(
            name__startswith='NFT #'
        )
        
        if dry_run:
            self.stdout.write(f'Would delete {dummy_nfts.count()} dummy NFTs:')
            for nft in dummy_nfts:
                self.stdout.write(f'  - {nft.name} (Token ID: {nft.token_id})')
        else:
            # Delete related transactions first
            transaction_count = Transaction.objects.filter(nft__in=dummy_nfts).count()
            Transaction.objects.filter(nft__in=dummy_nfts).delete()
            self.stdout.write(f'Deleted {transaction_count} related transactions')
            
            # Delete related favorites
            favorite_count = Favorite.objects.filter(nft__in=dummy_nfts).count()
            Favorite.objects.filter(nft__in=dummy_nfts).delete()
            self.stdout.write(f'Deleted {favorite_count} related favorites')
            
            # Delete the NFTs
            nft_count = dummy_nfts.count()
            dummy_nfts.delete()
            
            self.stdout.write(
                self.style.SUCCESS(f'Successfully deleted {nft_count} dummy NFTs!')
            ) 