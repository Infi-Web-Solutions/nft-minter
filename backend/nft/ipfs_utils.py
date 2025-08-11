# ipfs_utils.py
import requests
import json
import os
from base64 import b64decode
from django.conf import settings

# Pinata configuration
PINATA_JWT = os.getenv('PINATA_JWT')
PINATA_API_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS"

def upload_to_ipfs(file_data):
    """
    Upload a file to IPFS using Pinata
    """
    print("[IPFS] Starting file upload to IPFS...")
    print(f"[IPFS] PINATA_JWT configured: {'Yes' if PINATA_JWT else 'No'}")
    
    try:
        headers = {
            'Authorization': f'Bearer {PINATA_JWT}'
        }
        print("[IPFS] Headers configured")

        if isinstance(file_data, str) and file_data.startswith('data:'):
            print("[IPFS] Processing base64 data URL")
            # Handle base64 data URL
            format, imgstr = file_data.split(';base64,')
            ext = format.split('/')[-1]
            file_data = b64decode(imgstr)
            print(f"[IPFS] Decoded base64 data, format: {format}")
            
            files = {
                'file': ('file.' + ext, file_data)
            }
        else:
            print("[IPFS] Processing regular file data")
            # Handle regular file
            if hasattr(file_data, 'name'):
                print(f"[IPFS] File name: {file_data.name}")
            print(f"[IPFS] File data type: {type(file_data)}")
            
            files = {
                'file': file_data
            }

        print("[IPFS] Sending request to Pinata...")
        response = requests.post(
            PINATA_API_URL,
            files=files,
            headers=headers
        )
        print(f"[IPFS] Response status code: {response.status_code}")
        print(f"[IPFS] Response headers: {response.headers}")

        if response.status_code == 200:
            ipfs_hash = response.json()['IpfsHash']
            print(f"[IPFS] Successfully uploaded. IPFS Hash: {ipfs_hash}")
            return ipfs_hash
        else:
            print(f"[IPFS] Upload failed. Response: {response.text}")
            raise Exception(f"Failed to upload to IPFS: {response.text}")

    except Exception as e:
        raise Exception(f"Error uploading to IPFS: {str(e)}")
