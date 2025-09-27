# ipfs_utils.py
import requests
import json
import os
from base64 import b64decode
from django.conf import settings
import re


PINATA_API_KEY='cf65cebdda6beba7c9a0'
PINATA_SECRET_KEY='e7720e7eb32ed7b3779f2aed5aa4804e26fb7ceabe2e181655d114a17de02944'
PINATA_JWT='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI0YjM0ODdmOS1iZWJmLTQwZWQtYjlhZC1hMmE4ZjdmNWNmOWIiLCJlbWFpbCI6ImtyYWphczEyMjVAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBpbl9wb2xpY3kiOnsicmVnaW9ucyI6W3siZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiRlJBMSJ9LHsiZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiTllDMSJ9XSwidmVyc2lvbiI6MX0sIm1mYV9lbmFibGVkIjpmYWxzZSwic3RhdHVzIjoiQUNUSVZFIn0sImF1dGhlbnRpY2F0aW9uVHlwZSI6InNjb3BlZEtleSIsInNjb3BlZEtleUtleSI6ImNmNjVjZWJkZGE2YmViYTdjOWEwIiwic2NvcGVkS2V5U2VjcmV0IjoiZTc3MjBlN2ViMzJlZDdiMzc3OWYyYWVkNWFhNDgwNGUyNmZiN2NlYWJlMmUxODE2NTVkMTE0YTE3ZGUwMjk0NCIsImV4cCI6MTc4NTkwMzM3MX0.p-fim6ki_5MrIi1cG0QGexSXtGG5rPA5_46sz6HRfVM'
# Pinata configuration
# Read and sanitize the token: strip whitespace/newlines and remove accidental "Bearer" prefix
_raw_token = os.getenv('PINATA_JWT', '') or PINATA_JWT
# Trim leading/trailing whitespace and remove accidental Bearer prefix
_raw_token = _raw_token.strip()
if _raw_token.lower().startswith('bearer '):
    _raw_token = _raw_token.split(' ', 1)[1].strip()
# Remove any internal whitespace/quotes that may sneak in from copy/paste
_raw_token = _raw_token.replace('\n', '').replace('\r', '').replace('\t', '').replace(' ', '')
_raw_token = _raw_token.replace('"', '').replace("'", '')
PINATA_JWT = _raw_token
PINATA_API_KEY = (os.getenv('PINATA_API_KEY') or PINATA_API_KEY ).strip()
PINATA_API_SECRET = (os.getenv('PINATA_API_SECRET') or PINATA_SECRET_KEY).strip()
_JWT_REGEX = re.compile(r'^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')
PINATA_API_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS"

def _build_pinata_headers():
    """Return auth headers and mode for Pinata (JWT or API key/secret)."""
    if PINATA_JWT and _JWT_REGEX.match(PINATA_JWT):
        return { 'Authorization': f'Bearer {PINATA_JWT}' }, 'jwt'
    if PINATA_API_KEY and PINATA_API_SECRET:
        return {
            'pinata_api_key': PINATA_API_KEY,
            'pinata_secret_api_key': PINATA_API_SECRET,
        }, 'key_secret'
    return None, 'none'

def upload_to_ipfs(file_data):
    """
    Upload a file to IPFS using Pinata
    """
    print("[IPFS] Starting file upload to IPFS...")
    print(f"[IPFS] PINATA_JWT configured: {'Yes' if PINATA_JWT else 'No'}")
    
    try:
        headers, auth_mode = _build_pinata_headers()
        if not headers:
            raise Exception("Pinata credentials not configured. Set PINATA_JWT or PINATA_API_KEY and PINATA_API_SECRET.")
        print(f"[IPFS] Using Pinata auth mode: {auth_mode}")
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

            # If bytes were passed (e.g., file.read()), include a filename for multipart
            if isinstance(file_data, (bytes, bytearray)):
                files = {
                    'file': ('file.bin', file_data)
                }
            else:
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

