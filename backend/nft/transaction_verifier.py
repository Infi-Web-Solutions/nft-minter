from web3 import Web3
from eth_account.messages import encode_defunct
from django.conf import settings
import os
import time

class TransactionVerifier:
    def __init__(self):
        self.w3 = Web3(Web3.HTTPProvider(os.getenv('ALCHEMY_API_URL', "https://eth-sepolia.g.alchemy.com/v2/Bxo3zUQluKPV1Z9k0ajGE")))
        self.contract_address = Web3.to_checksum_address(os.getenv('NFT_CONTRACT_ADDRESS', "0xAB6FEdb0AdB537166425fd2bBd1F416b99899201"))

    def verify_transaction(self, tx_hash: str, expected_token_id: int, expected_new_owner: str) -> dict:
        """
        Verify that a transaction exists, is confirmed, and represents a valid NFT transfer
        Returns a dictionary with verification status and details
        """
        try:
            # Wait for transaction to be mined
            max_attempts = 5
            attempts = 0
            while attempts < max_attempts:
                try:
                    tx_receipt = self.w3.eth.get_transaction_receipt(tx_hash)
                    if tx_receipt:
                        break
                except Exception:
                    attempts += 1
                    if attempts == max_attempts:
                        return {
                            'verified': False,
                            'error': 'Transaction not found or not confirmed'
                        }
                    time.sleep(2)  # Wait 2 seconds before next attempt

            if not tx_receipt or tx_receipt['status'] != 1:
                return {
                    'verified': False,
                    'error': 'Transaction failed or was reverted'
                }

            # Verify this is a transaction to our contract
            if tx_receipt['to'] and tx_receipt['to'].lower() != self.contract_address.lower():
                return {
                    'verified': False,
                    'error': 'Transaction is not for the NFT marketplace contract'
                }

            # Look for Transfer event in logs
            transfer_topic = self.w3.keccak(text='Transfer(address,address,uint256)').hex()
            transfer_logs = [log for log in tx_receipt['logs'] 
                           if len(log['topics']) > 3 
                           and log['topics'][0].hex() == transfer_topic]

            if not transfer_logs:
                return {
                    'verified': False,
                    'error': 'No NFT transfer event found in transaction'
                }

            # Verify token ID and new owner from the event
            for log in transfer_logs:
                token_id = int(log['topics'][3].hex(), 16)
                to_address = '0x' + log['topics'][2].hex()[-40:]  # Extract address from topic

                if token_id == expected_token_id and to_address.lower() == expected_new_owner.lower():
                    return {
                        'verified': True,
                        'transaction': {
                            'hash': tx_hash,
                            'block_number': tx_receipt['blockNumber'],
                            'gas_used': tx_receipt['gasUsed'],
                            'gas_price': self.w3.eth.get_transaction(tx_hash)['gasPrice'],
                            'token_id': token_id,
                            'new_owner': to_address
                        }
                    }

            return {
                'verified': False,
                'error': 'Transaction does not match expected token ID or new owner'
            }

        except Exception as e:
            return {
                'verified': False,
                'error': f'Verification error: {str(e)}'
            }