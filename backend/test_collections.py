#!/usr/bin/env python
import os
import sys
import django

# Add the project directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

# Test OpenSea collections
from nft.opensea_service import opensea_service

print("=== OpenSea Collections Test ===")

try:
    print("Testing OpenSea collections...")
    result = opensea_service.get_collections(limit=5)
    
    if 'error' in result:
        print(f"Error: {result['error']}")
    else:
        collections = result.get('collections', [])
        print(f"Success! Found {len(collections)} collections")
        for i, collection in enumerate(collections[:3]):
            print(f"Collection {i+1}: {collection.get('name', 'No name')}")
            print(f"  Slug: {collection.get('slug', 'No slug')}")
            print(f"  Floor Price: {collection.get('stats', {}).get('floor_price', 'N/A')}")
            print(f"  Total Volume: {collection.get('stats', {}).get('total_volume', 'N/A')}")
            print()

except Exception as e:
    print(f"Exception: {e}")
    import traceback
    traceback.print_exc()

print("=== Test Complete ===") 