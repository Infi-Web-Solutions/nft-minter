from django.core.management.base import BaseCommand
from nft.models import NFT
from nft.web3_utils import web3_instance
import time

class Command(BaseCommand):
    help = 'Sync NFT ownership with blockchain for all NFTs'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Show what would be changed without making changes')
        parser.add_argument('--limit', type=int, default=10, help='Limit number of NFTs to check')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        limit = options['limit']
        
        self.stdout.write(f'Starting ownership sync (dry_run={dry_run}, limit={limit})')
        
        # Get NFTs that are listed (more likely to have ownership changes)
        nfts = NFT.objects.filter(is_listed=True)[:limit]
        
        if not nfts.exists():
            self.stdout.write('No listed NFTs found to check')
            return
            
        web3 = web3_instance
        updated_count = 0
        
        for nft in nfts:
            try:
                # Get current owner from blockchain
                blockchain_owner = web3.get_nft_owner(nft.token_id)
                
                if blockchain_owner and blockchain_owner.lower() != nft.owner_address.lower():
                    self.stdout.write(f'🔄 NFT {nft.token_id} ownership mismatch:')
                    self.stdout.write(f'   Database: {nft.owner_address}')
                    self.stdout.write(f'   Blockchain: {blockchain_owner}')
                    
                    if not dry_run:
                        # Update database
                        nft.owner_address = blockchain_owner
                        nft.is_listed = False  # Mark as not listed after transfer
                        nft.save()
                        self.stdout.write(self.style.SUCCESS(f'   ✅ Updated'))
                        updated_count += 1
                    else:
                        self.stdout.write(f'   🔍 Would update (dry run)')
                else:
                    self.stdout.write(f'✅ NFT {nft.token_id} ownership is correct')
                    
                # Small delay to avoid rate limiting
                time.sleep(0.1)
                    
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'❌ Error checking NFT {nft.token_id}: {e}'))
        
        if not dry_run:
            self.stdout.write(self.style.SUCCESS(f'✅ Sync completed. Updated {updated_count} NFTs'))
        else:
            self.stdout.write(f'🔍 Dry run completed. Would update {updated_count} NFTs')
