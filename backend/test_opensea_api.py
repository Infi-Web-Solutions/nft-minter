#!/usr/bin/env python
"""
Test script to verify OpenSea API endpoints
"""
import requests
import json

def test_opensea_assets():
    """Test the OpenSea assets endpoint"""
    url = "http://localhost:8000/api/opensea/assets/"
    params = {
        "limit": 5,
        "offset": 0
    }
    
    print(f"Testing URL: {url}")
    print(f"Params: {params}")
    
    try:
        response = requests.get(url, params=params)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2)}")
            
            if data.get('success'):
                assets = data.get('data', [])
                print(f"Number of assets returned: {len(assets)}")
                
                if assets:
                    first_asset = assets[0]
                    print(f"First asset: {json.dumps(first_asset, indent=2)}")
            else:
                print(f"API Error: {data.get('error')}")
        else:
            print(f"HTTP Error: {response.text}")
            
    except Exception as e:
        print(f"Exception: {e}")

def test_opensea_collections():
    """Test the OpenSea collections endpoint"""
    url = "http://localhost:8000/api/opensea/collections/"
    params = {
        "limit": 5
    }
    
    print(f"\nTesting Collections URL: {url}")
    print(f"Params: {params}")
    
    try:
        response = requests.get(url, params=params)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2)}")
        else:
            print(f"HTTP Error: {response.text}")
            
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    print("Testing OpenSea API endpoints...")
    test_opensea_assets()
    test_opensea_collections() 