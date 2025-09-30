from django.core.management.base import BaseCommand
from nft.models import NFT
from nft.web3_utils import web3_instance

class Command(BaseCommand):
    help = 'Fix NFT ownership by syncing with blockchain'

    def add_arguments(self, parser):
        parser.add_argument('--token-id', type=int, help='Specific token ID to fix')
        parser.add_argument('--all', action='store_true', help='Fix all NFTs')

    def handle(self, *args, **options):
        if options['token_id']:
            nfts = [NFT.objects.get(token_id=options['token_id'])]
        elif options['all']:
            nfts = NFT.objects.all()
        else:
            self.stdout.write(self.style.ERROR('Please specify --token-id or --all'))
            return

        web3 = web3_instance
        
        for nft in nfts:
            try:
                # Get current owner from blockchain
                blockchain_owner = web3.get_nft_owner(nft.token_id)
                
                if blockchain_owner and blockchain_owner.lower() != nft.owner_address.lower():
                    self.stdout.write(f'Fixing NFT {nft.token_id}:')
                    self.stdout.write(f'  Database owner: {nft.owner_address}')
                    self.stdout.write(f'  Blockchain owner: {blockchain_owner}')
                    
                    # Update database
                    nft.owner_address = blockchain_owner
                    nft.is_listed = False  # Mark as not listed after transfer
                    nft.save()
                    
                    self.stdout.write(self.style.SUCCESS(f'  ✅ Updated NFT {nft.token_id}'))
                else:
                    self.stdout.write(f'  ✅ NFT {nft.token_id} is already correct')
                    
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'  ❌ Error fixing NFT {nft.token_id}: {e}'))
