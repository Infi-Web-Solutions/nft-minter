#!/usr/bin/env python
import os
import sys
import django

# Add the project directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

# Test OpenSea service
from nft.opensea_service import opensea_service

print("=== OpenSea API Test ===")

# Test basic connection
try:
    print("Testing OpenSea API connection...")
    result = opensea_service.get_assets(limit=2)
    
    if 'error' in result:
        print(f"Error: {result['error']}")
    else:
        print(f"Success! Found {len(result.get('assets', []))} assets")
        if result.get('assets'):
            asset = result['assets'][0]
            print(f"First asset: {asset.get('name', 'No name')}")
            print(f"Collection: {asset.get('collection', {}).get('name', 'No collection')}")
            print(f"Image URL: {asset.get('image_url', 'No image')}")
    
except Exception as e:
    print(f"Exception: {e}")
    import traceback
    traceback.print_exc()

print("=== Test Complete ===") 