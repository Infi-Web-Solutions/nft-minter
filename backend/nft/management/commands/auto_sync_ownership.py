from django.core.management.base import BaseCommand
from nft.models import NFT
from nft.web3_utils import web3_instance
import time
from django.utils import timezone
from datetime import timedelta

class Command(BaseCommand):
    help = 'Automatically sync NFT ownership with blockchain'

    def add_arguments(self, parser):
        parser.add_argument('--interval', type=int, default=300, help='Sync interval in seconds (default: 5 minutes)')
        parser.add_argument('--once', action='store_true', help='Run once and exit')

    def handle(self, *args, **options):
        interval = options['interval']
        run_once = options['once']
        
        self.stdout.write(f'Starting automatic ownership sync (interval: {interval}s)')
        
        while True:
            try:
                self.sync_ownership()
                
                if run_once:
                    break
                    
                self.stdout.write(f'Waiting {interval} seconds before next sync...')
                time.sleep(interval)
                
            except KeyboardInterrupt:
                self.stdout.write('\nStopping automatic sync...')
                break
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'Error in sync loop: {e}'))
                time.sleep(60)  # Wait 1 minute before retrying

    def sync_ownership(self):
        """Sync ownership for all listed NFTs"""
        web3 = web3_instance
        updated_count = 0
        
        # Get NFTs that are listed (more likely to have ownership changes)
        nfts = NFT.objects.filter(is_listed=True)
        
        self.stdout.write(f'Checking {nfts.count()} listed NFTs...')
        
        for nft in nfts:
            try:
                # Get current owner from blockchain
                blockchain_owner = web3.get_nft_owner(nft.token_id)
                
                if blockchain_owner and blockchain_owner.lower() != nft.owner_address.lower():
                    self.stdout.write(f'🔄 Syncing NFT {nft.token_id}: {nft.owner_address} → {blockchain_owner}')
                    
                    # Update database
                    nft.owner_address = blockchain_owner
                    nft.is_listed = False  # Mark as not listed after transfer
                    nft.save()
                    
                    updated_count += 1
                    self.stdout.write(self.style.SUCCESS(f'  ✅ Updated'))
                    
                # Small delay to avoid rate limiting
                time.sleep(0.1)
                    
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'  ❌ Error syncing NFT {nft.token_id}: {e}'))
        
        if updated_count > 0:
            self.stdout.write(self.style.SUCCESS(f'✅ Sync completed. Updated {updated_count} NFTs'))
        else:
            self.stdout.write('✅ No updates needed')
