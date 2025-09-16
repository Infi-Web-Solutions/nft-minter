#!/usr/bin/env python
import os
import sys
import django

# Add the project directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

# Test imports
from nft.web3_utils import web3_instance
from nft.models import NFT, Collection

print("=== Django Setup Test ===")
print(f"Web3 connected: {web3_instance.is_connected()}")
print(f"Contract address: {web3_instance.contract_address}")

# Test contract info
try:
    contract_info = web3_instance.get_contract_info()
    print(f"Contract info: {contract_info}")
except Exception as e:
    print(f"Error getting contract info: {e}")

# Test database models
try:
    nft_count = NFT.objects.count()
    collection_count = Collection.objects.count()
    print(f"Database models working - NFTs: {nft_count}, Collections: {collection_count}")
except Exception as e:
    print(f"Database error: {e}")

print("=== Test Complete ===") 