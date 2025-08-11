import json
import os
from web3 import Web3
from eth_account import Account
from django.conf import settings

class NFTMarketplaceWeb3:
    def __init__(self):
        print("[Web3] Initializing NFTMarketplaceWeb3...")
        # Sepolia testnet configuration
        self.sepolia_url = os.getenv('ALCHEMY_API_URL', "ADD_YOUR_ALCHEMY_URL_HERE")
        self.contract_address = os.getenv('NFT_CONTRACT_ADDRESS', "ADD_YOUR_CONTRACT_ADDRESS_HERE")
        
        print(f"[Web3] Using Sepolia URL: {self.sepolia_url}")
        print(f"[Web3] Contract address: {self.contract_address}")
        
        if not Web3.is_address(self.contract_address):
            raise ValueError(f"Invalid contract address: {self.contract_address}")
        
        try:
            print("[Web3] Connecting to Ethereum network...")
            provider = Web3.HTTPProvider(self.sepolia_url)
            self.w3 = Web3(provider)
            
            if not self.w3.is_connected():
                print("[Web3] WARNING: Could not connect to Ethereum network")
                raise ConnectionError("Could not connect to Ethereum network")
            
            print("[Web3] Successfully connected to Ethereum network")
            print(f"[Web3] Network: {self.w3.eth.chain_id}")
            
            # Convert contract address to checksum address
            self.contract_address = Web3.to_checksum_address(self.contract_address)
            print(f"[Web3] Using checksum address: {self.contract_address}")
            
            # Verify contract exists
            code = self.w3.eth.get_code(self.contract_address)
            if code.hex() == '0x':
                raise ValueError(f"No contract found at address {self.contract_address}")
            
            # Contract ABI (you'll need to get this from your compiled contract)
            self.contract_abi = self._get_contract_abi()
            if not self.contract_abi:
                raise ValueError("Contract ABI is empty or invalid")
            
            print(f"[Web3] Loaded ABI with {len(self.contract_abi)} functions")
            print("[Web3] Available functions:", [func['name'] for func in self.contract_abi if func.get('type') == 'function'])
            
            # Initialize contract
            print(f"[Web3] Initializing contract with address: {self.contract_address}")
            print(f"[Web3] Contract ABI type: {type(self.contract_abi)}")
            print(f"[Web3] First few ABI entries: {self.contract_abi[:2]}")
            
            # Extra validation before contract initialization
            if not self.contract_address:
                raise ValueError("Contract address is null or empty")
            
            if not isinstance(self.contract_abi, list):
                raise ValueError(f"Invalid ABI format. Expected list, got {type(self.contract_abi)}")
            
            if not self.contract_abi:
                raise ValueError("Contract ABI is empty")
                
            print(f"[Web3] Pre-initialization validation passed")
            print(f"[Web3] Contract address: {self.contract_address}")
            print(f"[Web3] ABI length: {len(self.contract_abi)}")
            
            try:
                self.contract = self.w3.eth.contract(
                    address=self.contract_address,
                    abi=self.contract_abi
                )
                print("[Web3] Contract successfully initialized")
            except Exception as e:
                print(f"[Web3] Contract initialization failed: {str(e)}")
                print(f"[Web3] Contract address type: {type(self.contract_address)}")
                print(f"[Web3] Contract address value: {self.contract_address}")
                raise
            
            # Test basic contract calls
            try:
                name = self.contract.functions.name().call()
                symbol = self.contract.functions.symbol().call()
                print(f"[Web3] Contract name: {name}")
                print(f"[Web3] Contract symbol: {symbol}")
            except Exception as e:
                print(f"[Web3] Warning: Could not get contract name/symbol: {str(e)}")
                
        except Exception as e:
            print(f"[Web3] Error initializing web3: {str(e)}")
            print(f"[Web3] Error type: {type(e)}")
            print(f"[Web3] Error args: {e.args}")
            raise
    
    def _get_contract_abi(self):
        """Get contract ABI from the compiled contract"""
        try:
            print("[Web3] Getting contract ABI...")
            # Try to get BASE_DIR from Django settings
            try:
                from django.conf import settings
                base_dir = settings.BASE_DIR
                print(f"[Web3] Using Django settings BASE_DIR: {base_dir}")
            except:
                print("[Web3] Django settings not found, using fallback path")
                # Fallback if Django settings not available
                base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            
            # Path to the compiled contract artifacts
            artifacts_path = os.path.join(
                os.path.dirname(base_dir), 
                'smartcontract', 
                'artifacts', 
                'contracts', 
                'nftmarketplace.sol', 
                'NFTMarketplace.json'
            )
            print(f"[Web3] Looking for contract ABI at: {artifacts_path}")
            
            if not os.path.exists(artifacts_path):
                print(f"[Web3] Error: Contract artifact not found at {artifacts_path}")
                raise FileNotFoundError(f"Contract artifact not found at {artifacts_path}")
                
            print(f"[Web3] File exists: {os.path.exists(artifacts_path)}")
            
            try:
                with open(artifacts_path, 'r') as f:
                    contract_data = json.load(f)
                    if 'abi' not in contract_data:
                        raise ValueError("No 'abi' field found in contract artifact")
                    print(f"[Web3] Successfully loaded contract artifact")
                    return contract_data['abi']
            except json.JSONDecodeError as e:
                print(f"[Web3] Error: Invalid JSON in contract artifact: {str(e)}")
                raise
            except Exception as e:
                print(f"[Web3] Error loading contract artifact: {str(e)}")
                raise

            with open(artifacts_path, 'r') as f:
                contract_data = json.load(f)
                abi = contract_data['abi']
                print(f"[Web3] Successfully loaded ABI with {len(abi)} functions")
                print("[Web3] Available functions:", [func['name'] for func in abi if func.get('type') == 'function'])
                return abi
        except FileNotFoundError:
            # Fallback ABI (basic structure - you should replace this with actual ABI)
            return [
                {
                    "inputs": [],
                    "stateMutability": "nonpayable",
                    "type": "constructor"
                },
                {
                    "anonymous": False,
                    "inputs": [
                        {
                            "indexed": True,
                            "internalType": "address",
                            "name": "owner",
                            "type": "address"
                        },
                        {
                            "indexed": True,
                            "internalType": "address",
                            "name": "approved",
                            "type": "address"
                        },
                        {
                            "indexed": True,
                            "internalType": "uint256",
                            "name": "tokenId",
                            "type": "uint256"
                        }
                    ],
                    "name": "Approval",
                    "type": "event"
                },
                {
                    "anonymous": False,
                    "inputs": [
                        {
                            "indexed": True,
                            "internalType": "address",
                            "name": "from",
                            "type": "address"
                        },
                        {
                            "indexed": True,
                            "internalType": "address",
                            "name": "to",
                            "type": "address"
                        },
                        {
                            "indexed": True,
                            "internalType": "uint256",
                            "name": "tokenId",
                            "type": "uint256"
                        }
                    ],
                    "name": "Transfer",
                    "type": "event"
                },
                {
                    "inputs": [
                        {
                            "internalType": "address",
                            "name": "to",
                            "type": "address"
                        },
                        {
                            "internalType": "uint256",
                            "name": "tokenId",
                            "type": "uint256"
                        }
                    ],
                    "name": "approve",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "inputs": [
                        {
                            "internalType": "address",
                            "name": "owner",
                            "type": "address"
                        }
                    ],
                    "name": "balanceOf",
                    "outputs": [
                        {
                            "internalType": "uint256",
                            "name": "",
                            "type": "uint256"
                        }
                    ],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [
                        {
                            "internalType": "uint256",
                            "name": "tokenId",
                            "type": "uint256"
                        }
                    ],
                    "name": "getApproved",
                    "outputs": [
                        {
                            "internalType": "address",
                            "name": "",
                            "type": "address"
                        }
                    ],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [
                        {
                            "internalType": "address",
                            "name": "owner",
                            "type": "address"
                        },
                        {
                            "internalType": "address",
                            "name": "operator",
                            "type": "address"
                        }
                    ],
                    "name": "isApprovedForAll",
                    "outputs": [
                        {
                            "internalType": "bool",
                            "name": "",
                            "type": "bool"
                        }
                    ],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [],
                    "name": "name",
                    "outputs": [
                        {
                            "internalType": "string",
                            "name": "",
                            "type": "string"
                        }
                    ],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [
                        {
                            "internalType": "uint256",
                            "name": "tokenId",
                            "type": "uint256"
                        }
                    ],
                    "name": "ownerOf",
                    "outputs": [
                        {
                            "internalType": "address",
                            "name": "",
                            "type": "address"
                        }
                    ],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [
                        {
                            "internalType": "address",
                            "name": "from",
                            "type": "address"
                        },
                        {
                            "internalType": "address",
                            "name": "to",
                            "type": "address"
                        },
                        {
                            "internalType": "uint256",
                            "name": "tokenId",
                            "type": "uint256"
                        }
                    ],
                    "name": "safeTransferFrom",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "inputs": [
                        {
                            "internalType": "address",
                            "name": "from",
                            "type": "address"
                        },
                        {
                            "internalType": "address",
                            "name": "to",
                            "type": "address"
                        },
                        {
                            "internalType": "uint256",
                            "name": "tokenId",
                            "type": "uint256"
                        },
                        {
                            "internalType": "bytes",
                            "name": "data",
                            "type": "bytes"
                        }
                    ],
                    "name": "safeTransferFrom",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "inputs": [
                        {
                            "internalType": "address",
                            "name": "operator",
                            "type": "address"
                        },
                        {
                            "internalType": "bool",
                            "name": "approved",
                            "type": "bool"
                        }
                    ],
                    "name": "setApprovalForAll",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "inputs": [],
                    "name": "symbol",
                    "outputs": [
                        {
                            "internalType": "string",
                            "name": "",
                            "type": "string"
                        }
                    ],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [
                        {
                            "internalType": "uint256",
                            "name": "tokenId",
                            "type": "uint256"
                        }
                    ],
                    "name": "tokenURI",
                    "outputs": [
                        {
                            "internalType": "string",
                            "name": "",
                            "type": "string"
                        }
                    ],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [
                        {
                            "internalType": "address",
                            "name": "from",
                            "type": "address"
                        },
                        {
                            "internalType": "address",
                            "name": "to",
                            "type": "address"
                        },
                        {
                            "internalType": "uint256",
                            "name": "tokenId",
                            "type": "uint256"
                        }
                    ],
                    "name": "transferFrom",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                }
            ]
    
    def get_contract_info(self):
        """Get basic contract information"""
        try:
            name = self.contract.functions.name().call()
            symbol = self.contract.functions.symbol().call()
            return {
                'name': name,
                'symbol': symbol,
                'address': self.contract_address,
                'network': 'Sepolia Testnet'
            }
        except Exception as e:
            return {'error': str(e)}
    
    def get_nft_owner(self, token_id):
        """Get the owner of a specific NFT"""
        try:
            owner = self.contract.functions.ownerOf(token_id).call()
            return owner
        except Exception as e:
            return None
    
    def get_user_nfts(self, user_address):
        """Get all NFTs owned by a user"""
        try:
            balance = self.contract.functions.balanceOf(user_address).call()
            nfts = []
            
            # This is a simplified approach - in a real scenario, you'd need to track token IDs
            # For now, we'll return the balance
            return {
                'balance': balance,
                'user_address': user_address
            }
        except Exception as e:
            return {'error': str(e)}
    
    def get_nft_metadata(self, token_id):
        """Get metadata for a specific NFT"""
        try:
            token_uri = self.contract.functions.tokenURI(token_id).call()
            owner = self.contract.functions.ownerOf(token_id).call()
            
            return {
                'token_id': token_id,
                'token_uri': token_uri,
                'owner': owner
            }
        except Exception as e:
            return {'error': str(e)}
    
    def is_connected(self):
        """Check if Web3 is connected to the network"""
        return self.w3.is_connected()
    
    def get_latest_block(self):
        """Get the latest block number"""
        try:
            return self.w3.eth.block_number
        except Exception as e:
            return None

# Create a singleton instance
web3_instance = NFTMarketplaceWeb3() 