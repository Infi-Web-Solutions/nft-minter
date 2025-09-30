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
        """Sync ownership for all NFTs and update user profiles"""
        web3 = web3_instance
        updated_count = 0
        profile_updates = 0
        
        # Get all NFTs (not just listed ones, in case some were delisted)
        nfts = NFT.objects.all()
        
        self.stdout.write(f'Checking {nfts.count()} total NFTs...')
        
        for nft in nfts:
            try:
                # Get current owner from blockchain
                blockchain_owner = web3.get_nft_owner(nft.token_id)
                
                if blockchain_owner and blockchain_owner.lower() != (nft.owner_address or '').lower():
                    old_owner = nft.owner_address
                    self.stdout.write(f'🔄 Syncing NFT {nft.token_id}: {old_owner} → {blockchain_owner}')
                    
                    # Update database
                    # Normalize to lowercase for consistent storage
                    nft.owner_address = blockchain_owner.lower()
                    nft.is_listed = False  # Mark as not listed after transfer
                    nft.save()
                    
                    # Update user profiles for both old and new owners
                    self.update_user_profiles((old_owner or '').lower(), blockchain_owner.lower())

                    # Record a transfer transaction for stats/history
                    try:
                        from nft.models import Transaction
                        simulated_hash = f"autosync_transfer_{nft.token_id}_{int(time.time())}"
                        Transaction.objects.create(
                            transaction_hash=simulated_hash,
                            nft=nft,
                            from_address=(old_owner or ''),
                            to_address=blockchain_owner.lower(),
                            transaction_type='transfer',
                            price=None,
                            block_number=0,
                            gas_used=0,
                            gas_price=0,
                            timestamp=timezone.now()
                        )
                    except Exception as tx_err:
                        self.stdout.write(self.style.WARNING(f'  ⚠️ Failed to record transfer tx: {tx_err}'))
                    profile_updates += 1
                    
                    updated_count += 1
                    self.stdout.write(self.style.SUCCESS(f'  ✅ Updated NFT and profiles'))
                    
                # Small delay to avoid rate limiting
                time.sleep(0.1)
                    
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'  ❌ Error syncing NFT {nft.token_id}: {e}'))
        
        if updated_count > 0:
            self.stdout.write(self.style.SUCCESS(f'✅ Sync completed. Updated {updated_count} NFTs and {profile_updates} profile pairs'))
        else:
            self.stdout.write('✅ No updates needed')

    def update_user_profiles(self, old_owner, new_owner):
        """Update user profiles for ownership changes"""
        try:
            from nft.models import UserProfile
            
            # Update old owner's profile
            if old_owner and old_owner != '0x0000000000000000000000000000000000000000':
                try:
                    old_profile = UserProfile.objects.get(wallet_address=old_owner)
                    old_profile.nfts_owned = NFT.objects.filter(owner_address=old_owner).count()
                    old_profile.save()
                    self.stdout.write(f'  📊 Updated old owner profile: {old_owner}')
                except UserProfile.DoesNotExist:
                    pass
            
            # Update new owner's profile
            if new_owner and new_owner != '0x0000000000000000000000000000000000000000':
                try:
                    new_profile = UserProfile.objects.get(wallet_address=new_owner)
                    new_profile.nfts_owned = NFT.objects.filter(owner_address=new_owner).count()
                    new_profile.save()
                    self.stdout.write(f'  📊 Updated new owner profile: {new_owner}')
                except UserProfile.DoesNotExist:
                    pass
                    
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'  ❌ Error updating profiles: {e}'))
