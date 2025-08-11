from django.core.management.base import BaseCommand
from django.utils import timezone
from nft.models import NFT, Collection, Transaction
from nft.web3_utils import web3_instance
import json

class Command(BaseCommand):
    help = 'Sync blockchain data with local database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--token-id',
            type=int,
            help='Sync specific token ID',
        )
        parser.add_argument(
            '--all',
            action='store_true',
            help='Sync all NFTs',
        )
        parser.add_argument(
            '--create-dummy',
            action='store_true',
            help='Create dummy NFTs if no real ones exist (for testing only)',
        )

    def handle(self, *args, **options):
        if not web3_instance.is_connected():
            self.stdout.write(
                self.style.ERROR('Failed to connect to blockchain network')
            )
            return

        if options['token_id']:
            self.sync_single_nft(options['token_id'])
        elif options['all']:
            self.sync_all_nfts(options['create_dummy'])
        else:
            self.stdout.write(
                self.style.WARNING('Please specify --token-id or --all')
            )

    def sync_single_nft(self, token_id):
        """Sync a single NFT from blockchain"""
        try:
            # Get blockchain data
            blockchain_data = web3_instance.get_nft_metadata(token_id)
            
            if 'error' in blockchain_data:
                self.stdout.write(
                    self.style.ERROR(f'Error getting NFT {token_id}: {blockchain_data["error"]}')
                )
                return

            # Create or update NFT in database
            nft, created = NFT.objects.get_or_create(
                token_id=token_id,
                defaults={
                    'name': f'NFT #{token_id}',
                    'description': f'Token ID: {token_id}',
                    'image_url': 'https://via.placeholder.com/400x400',
                    'token_uri': blockchain_data.get('token_uri', ''),
                    'owner_address': blockchain_data.get('owner', ''),
                    'creator_address': blockchain_data.get('owner', ''),
                    'price': None,
                    'is_listed': False,
                    'is_auction': False,
                    'royalty_percentage': 0,
                }
            )

            if created:
                self.stdout.write(
                    self.style.SUCCESS(f'Created NFT {token_id}')
                )
            else:
                # Update existing NFT
                nft.owner_address = blockchain_data.get('owner', nft.owner_address)
                nft.token_uri = blockchain_data.get('token_uri', nft.token_uri)
                nft.save()
                self.stdout.write(
                    self.style.SUCCESS(f'Updated NFT {token_id}')
                )

        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Error syncing NFT {token_id}: {str(e)}')
            )

    def sync_all_nfts(self, create_dummy=False):
        """Sync all NFTs from blockchain"""
        try:
            # Check if we have any existing NFTs
            existing_nfts = NFT.objects.all()
            
            if not existing_nfts.exists() and not create_dummy:
                self.stdout.write(
                    self.style.WARNING('No NFTs found in database. Use --create-dummy flag to create test NFTs, or create real NFTs first.')
                )
                return
            
            if create_dummy:
                self.stdout.write(
                    self.style.WARNING('Creating dummy NFTs for testing purposes...')
                )
                # Create a few dummy NFTs for testing
                for token_id in range(1, 6):
                    nft, created = NFT.objects.get_or_create(
                        token_id=token_id,
                        defaults={
                            'name': f'Test NFT #{token_id}',
                            'description': f'Test NFT for development',
                            'image_url': f'https://picsum.photos/400/400?random={token_id}',
                            'token_uri': f'https://example.com/token/{token_id}',
                            'owner_address': '0x1234567890123456789012345678901234567890',
                            'creator_address': '0x1234567890123456789012345678901234567890',
                            'price': None,
                            'is_listed': False,
                            'is_auction': False,
                            'royalty_percentage': 0,
                        }
                    )
                    if created:
                        self.stdout.write(f'Created test NFT: {nft.name}')
            else:
                self.stdout.write(
                    self.style.SUCCESS(f'Found {existing_nfts.count()} existing NFTs')
                )

        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Error syncing all NFTs: {str(e)}')
            ) 