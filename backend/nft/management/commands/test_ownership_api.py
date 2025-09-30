from django.core.management.base import BaseCommand
import requests
import json

class Command(BaseCommand):
    help = 'Test the ownership transfer API endpoint'

    def add_arguments(self, parser):
        parser.add_argument('--token-id', type=int, default=50, help='Token ID to test')
        parser.add_argument('--base-url', type=str, default='http://localhost:8000', help='Base URL for API')

    def handle(self, *args, **options):
        token_id = options['token_id']
        base_url = options['base_url']
        
        url = f"{base_url}/api/nfts/{token_id}/transfer/"
        
        payload = {
            "new_owner": "0x8b22aD6DEA087968844f9FB001285A1dFaBa9Fcc",
            "transaction_hash": "test_hash_123",
            "price": "0.02"
        }
        
        self.stdout.write(f'Testing API endpoint: {url}')
        self.stdout.write(f'Payload: {json.dumps(payload, indent=2)}')
        
        try:
            response = requests.post(
                url,
                json=payload,
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            self.stdout.write(f'Response Status: {response.status_code}')
            self.stdout.write(f'Response Headers: {dict(response.headers)}')
            self.stdout.write(f'Response Body: {response.text}')
            
            if response.status_code == 200:
                self.stdout.write(self.style.SUCCESS('✅ API endpoint is working'))
            else:
                self.stdout.write(self.style.ERROR('❌ API endpoint returned error'))
                
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'❌ Error testing API: {e}'))
