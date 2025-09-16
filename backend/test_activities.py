#!/usr/bin/env python
import os
import sys
import django

# Add the backend directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from nft.models import Transaction, NFT, UserProfile
from django.utils import timezone
from datetime import timedelta
import random
from decimal import Decimal

def test_activities():
    print("Testing activities...")
    
    # Check if we have any transactions
    transaction_count = Transaction.objects.count()
    print(f"Total transactions in database: {transaction_count}")
    
    # Check if we have any NFTs
    nft_count = NFT.objects.count()
    print(f"Total NFTs in database: {nft_count}")
    
    if nft_count == 0:
        print("No NFTs found in database. Please create some NFTs first.")
        return
    
    if transaction_count == 0:
        print("No transactions found. Creating sample activities for existing NFTs...")
        
        # Create a sample user
        user1, created = UserProfile.objects.get_or_create(
            wallet_address="0x1234567890123456789012345678901234567890",
            defaults={'username': 'User123'}
        )
        
        user2, created = UserProfile.objects.get_or_create(
            wallet_address="0x0987654321098765432109876543210987654321",
            defaults={'username': 'User456'}
        )
        
        # Get existing NFTs
        existing_nfts = list(NFT.objects.all())
        if not existing_nfts:
            print("No NFTs found to create activities for.")
            return
        
        # Use the first existing NFT
        nft = existing_nfts[0]
        print(f"Creating activities for NFT: {nft.name}")
        
        # Create sample transactions
        transaction_types = ['mint', 'list', 'buy', 'bid', 'transfer', 'delist']
        
        for i in range(10):
            transaction_type = random.choice(transaction_types)
            hours_ago = random.randint(0, 24)
            timestamp = timezone.now() - timedelta(hours=hours_ago)
            
            transaction = Transaction.objects.create(
                transaction_hash=f"0x{random.getrandbits(256):064x}",
                nft=nft,
                from_address=user1.wallet_address,
                to_address=user2.wallet_address,
                transaction_type=transaction_type,
                price=Decimal(str(random.uniform(0.1, 10.0))) if transaction_type in ['buy', 'bid', 'list'] else None,
                block_number=random.randint(1000000, 9999999),
                gas_used=random.randint(50000, 500000),
                gas_price=Decimal(str(random.uniform(0.000000001, 0.0000001))),
                timestamp=timestamp
            )
            print(f"Created transaction: {transaction_type} for {nft.name}")
    
    # Test the API endpoint
    from django.test import RequestFactory
    from nft.views import get_activities
    
    factory = RequestFactory()
    request = factory.get('/api/activities/?page=1&limit=20&time_filter=24h')
    
    response = get_activities(request)
    print(f"API Response status: {response.status_code}")
    
    if response.status_code == 200:
        import json
        data = json.loads(response.content)
        print(f"Activities found: {len(data.get('data', []))}")
        if data.get('data'):
            print(f"First activity: {data['data'][0]}")
    else:
        print(f"Error: {response.content}")

if __name__ == '__main__':
    test_activities() 