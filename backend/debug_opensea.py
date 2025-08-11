#!/usr/bin/env python
import requests
import json

def debug_opensea_v2():
    api_key = "afe3df1df11d49babdbeeeeeefbdf113"
    headers = {
        "accept": "application/json",
        "X-API-KEY": api_key
    }
    
    url = "https://api.opensea.io/api/v2/collections"
    params = {"limit": 3}
    
    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("Raw response structure:")
            print(json.dumps(data, indent=2)[:1000])  # First 1000 chars
            
            if 'collections' in data and data['collections']:
                print("\nFirst collection structure:")
                first_collection = data['collections'][0]
                print(json.dumps(first_collection, indent=2))
        else:
            print(f"Error: {response.text}")
            
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    debug_opensea_v2() 