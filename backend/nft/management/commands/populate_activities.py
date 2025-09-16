from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
import random
from nft.models import NFT, Transaction, UserProfile
from decimal import Decimal

class Command(BaseCommand):
    help = 'Populate database with sample activities/transactions for existing NFTs'

    def add_arguments(self, parser):
        parser.add_argument(
            '--count',
            type=int,
            default=50,
            help='Number of activities to create'
        )

    def handle(self, *args, **options):
        count = options['count']
        
        # Check if we have any NFTs in the database
        existing_nfts = NFT.objects.all()
        if not existing_nfts.exists():
            self.stdout.write(
                self.style.WARNING('No NFTs found in database. Please create some NFTs first before running this command.')
            )
            return
        
        # Create sample users if they don't exist
        sample_users = []
        for i in range(20):
            # Generate a simple wallet address using hex
            wallet_address = f"0x{random.getrandbits(160):040x}"
            username = f"User{random.randint(100, 999)}"
            
            user_profile, created = UserProfile.objects.get_or_create(
                wallet_address=wallet_address,
                defaults={'username': username}
            )
            sample_users.append(user_profile)
            if created:
                self.stdout.write(f'Created user: {username} ({wallet_address})')
        
        # Use existing NFTs instead of creating dummy ones
        sample_nfts = list(existing_nfts)
        self.stdout.write(f'Using {len(sample_nfts)} existing NFTs for activities')
        
        # Create sample transactions
        transaction_types = ['mint', 'list', 'buy', 'bid', 'transfer', 'delist']
        
        for i in range(count):
            # Random timestamp within last 24 hours
            hours_ago = random.randint(0, 24)
            minutes_ago = random.randint(0, 60)
            timestamp = timezone.now() - timedelta(hours=hours_ago, minutes=minutes_ago)
            
            transaction_type = random.choice(transaction_types)
            nft = random.choice(sample_nfts)
            from_user = random.choice(sample_users)
            to_user = random.choice([u for u in sample_users if u != from_user])
            
            # Generate transaction hash
            tx_hash = f"0x{random.getrandbits(256):064x}"
            
            # Create transaction
            transaction = Transaction.objects.create(
                transaction_hash=tx_hash,
                nft=nft,
                from_address=from_user.wallet_address,
                to_address=to_user.wallet_address,
                transaction_type=transaction_type,
                price=Decimal(str(random.uniform(0.1, 10.0))) if transaction_type in ['buy', 'bid', 'list'] else None,
                block_number=random.randint(1000000, 9999999),
                gas_used=random.randint(50000, 500000),
                gas_price=Decimal(str(random.uniform(0.000000001, 0.0000001))),
                timestamp=timestamp
            )
            
            self.stdout.write(
                self.style.SUCCESS(f'Created transaction {i + 1}/{count}: {transaction_type} for {nft.name}')
            )
        
        self.stdout.write(
            self.style.SUCCESS(f'Successfully created {count} sample activities!')
        ) 