#!/usr/bin/env python
import requests
import json

# Test different OpenSea v2 endpoints
def test_opensea_v2_endpoints():
    api_key = "afe3df1df11d49babdbeeeeeefbdf113"
    headers = {
        "accept": "application/json",
        "X-API-KEY": api_key
    }
    
    # Test different endpoints
    endpoints = [
        "https://api.opensea.io/api/v2/collections",
        "https://api.opensea.io/api/v2/nfts",
        "https://api.opensea.io/api/v2/collections/boredapeyachtclub/stats",
        "https://api.opensea.io/api/v2/collections/boredapeyachtclub/nfts"
    ]
    
    for endpoint in endpoints:
        try:
            print(f"\nTesting: {endpoint}")
            response = requests.get(endpoint, headers=headers, timeout=10)
            print(f"Status: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print(f"Response keys: {list(data.keys()) if isinstance(data, dict) else 'Not a dict'}")
                if isinstance(data, dict) and 'collections' in data:
                    print(f"Found {len(data['collections'])} collections")
                elif isinstance(data, dict) and 'nfts' in data:
                    print(f"Found {len(data['nfts'])} NFTs")
            else:
                print(f"Error: {response.text[:200]}")
        except Exception as e:
            print(f"Exception: {e}")

if __name__ == "__main__":
    test_opensea_v2_endpoints() 