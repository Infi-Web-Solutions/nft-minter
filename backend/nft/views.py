from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.db.models import Q, Sum, Count, Min
from django.utils import timezone
import json
import time
from datetime import datetime, timedelta
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
import base64
from .utils import validate_file_size
from .file_handlers import handle_profile_image, handle_cover_image
from .models import NFT, Collection, UserProfile, Transaction, Favorite
from .web3_utils import web3_instance
from .ipfs_utils import upload_to_ipfs
from .auth_utils import get_or_create_web3_user
from django.utils import timezone

# User Profile Views
@csrf_exempt
@require_http_methods(["GET"])
def get_user_profile(request, wallet_address):
    """Get user profile by wallet address"""
    try:
        from django.contrib.auth.models import User
        import hashlib
        
        print(f"[DEBUG] get_user_profile called with wallet_address: {wallet_address}")
        
        # Create a safe username using hash of wallet address
        username_hash = hashlib.md5(wallet_address.encode()).hexdigest()[:12]
        username = f"user_{username_hash}"
        
        try:
            # Try to get existing user first
            user = User.objects.get(username=username)
            user_created = False
        except User.DoesNotExist:
            # Create new user if doesn't exist
            try:
                user = User.objects.create_user(
                    username=username,
                    email=f"{username}@example.com",
                    password='unusable'  # These users won't login traditionally
                )
                user_created = True
                print(f"[DEBUG] User created: {user_created}")
            except Exception as user_error:
                print(f"[ERROR] Failed to create user: {str(user_error)}")
                # If user creation fails, try to get or create profile without user
                try:
                    profile = UserProfile.objects.get(wallet_address=wallet_address)
                except UserProfile.DoesNotExist:
                    profile = UserProfile.objects.create(
                        wallet_address=wallet_address,
                        username=f"User{wallet_address[-4:]}"
                    )
                
                # Get user's NFTs
                user_nfts = NFT.objects.filter(owner_address=wallet_address)
                created_nfts = NFT.objects.filter(creator_address=wallet_address)
                
                profile_data = {
                    'id': profile.id,
                    'wallet_address': profile.wallet_address,
                    'username': profile.username or f"User{wallet_address[-4:]}",
                    'avatar_url': profile.avatar_url,
                    'banner_url': profile.banner_url,
                    'bio': profile.bio,
                    'website': profile.website,
                    'twitter': profile.twitter,
                    'instagram': profile.instagram,
                    'discord': profile.discord,
                    'total_created': profile.total_created or 0,
                    'total_collected': profile.total_collected or 0,
                    'total_volume': float(profile.total_volume) if profile.total_volume else 0,
                    'created_at': profile.created_at.isoformat(),
                    'nfts_owned': user_nfts.count(),
                    'nfts_created': created_nfts.count(),
                }
                
                return JsonResponse({
                    'success': True,
                    'data': profile_data
                })
        
        # Get or create profile
        try:
            profile, created = UserProfile.objects.get_or_create(
                wallet_address=wallet_address,
                defaults={
                    'user': user,
                    'username': f"User{wallet_address[-4:]}"
                }
            )
            print(f"[DEBUG] Profile created: {profile.id} {created}")
        except Exception as profile_error:
            print(f"[ERROR] Profile creation failed: {str(profile_error)}")
            # Return a basic profile response
            return JsonResponse({
                'success': True,
                'data': {
                    'id': 0,
                    'wallet_address': wallet_address,
                    'username': f"User{wallet_address[-4:]}",
                    'avatar_url': None,
                    'banner_url': None,
                    'bio': None,
                    'website': None,
                    'twitter': None,
                    'instagram': None,
                    'discord': None,
                    'total_created': 0,
                    'total_collected': 0,
                    'total_volume': 0,
                    'created_at': timezone.now().isoformat(),
                    'nfts_owned': 0,
                    'nfts_created': 0,
                }
            })
        
        # Get user's NFTs
        user_nfts = NFT.objects.filter(owner_address=wallet_address)
        created_nfts = NFT.objects.filter(creator_address=wallet_address)
        print(f"[DEBUG] NFTs found: {user_nfts.count()} {created_nfts.count()}")
        
        profile_data = {
            'id': profile.id,
            'wallet_address': profile.wallet_address,
            'username': profile.username or f"User{wallet_address[-4:]}",
            'avatar_url': profile.avatar_url,
            'banner_url': profile.banner_url,
            'bio': profile.bio,
            'website': profile.website,
            'twitter': profile.twitter,
            'instagram': profile.instagram,
            'discord': profile.discord,
            'total_created': profile.total_created or 0,
            'total_collected': profile.total_collected or 0,
            'total_volume': float(profile.total_volume) if profile.total_volume else 0,
            'created_at': profile.created_at.isoformat(),
            'nfts_owned': user_nfts.count(),
            'nfts_created': created_nfts.count(),
        }
        print(f"[DEBUG] Profile data: {profile_data}")
        
        return JsonResponse({
            'success': True,
            'data': profile_data
        })
    except Exception as e:
        print(f"[ERROR] get_user_profile failed: {str(e)}")
        # Return a fallback response instead of 500 error
        return JsonResponse({
            'success': True,
            'data': {
                'id': 0,
                'wallet_address': wallet_address,
                'username': f"User{wallet_address[-4:]}",
                'avatar_url': None,
                'banner_url': None,
                'bio': None,
                'website': None,
                'twitter': None,
                'instagram': None,
                'discord': None,
                'total_created': 0,
                'total_collected': 0,
                'total_volume': 0,
                'created_at': timezone.now().isoformat(),
                'nfts_owned': 0,
                'nfts_created': 0,
            }
        })

@csrf_exempt
@require_http_methods(["POST"])
def update_profile(request, wallet_address):
    """Update user profile including profile and cover images"""
    try:
        data = json.loads(request.body)
        # Get or create user profile
        profile, created = UserProfile.objects.get_or_create(wallet_address=wallet_address)
        # Handle profile image
        if 'profile_image' in data:
            image_data = data['profile_image']
            if image_data.startswith('data:image'):
                format, imgstr = image_data.split(';base64,')
                ext = format.split('/')[-1]
                filename = f'profile_{wallet_address}.{ext}'
                file_data = ContentFile(base64.b64decode(imgstr))
                file_path = default_storage.save(f'profile_images/{filename}', file_data)
                profile.avatar_url = request.build_absolute_uri(default_storage.url(file_path))
        # Handle cover image
        if 'cover_image' in data:
            image_data = data['cover_image']
            if image_data.startswith('data:image'):
                format, imgstr = image_data.split(';base64,')
                ext = format.split('/')[-1]
                filename = f'cover_{wallet_address}.{ext}'
                file_data = ContentFile(base64.b64decode(imgstr))
                file_path = default_storage.save(f'cover_images/{filename}', file_data)
                profile.banner_url = request.build_absolute_uri(default_storage.url(file_path))
        # Update other profile fields
        for field in ['username', 'bio', 'website', 'twitter', 'instagram', 'discord']:
            if field in data:
                setattr(profile, field, data[field])
        profile.save()
        return JsonResponse({
            'success': True,
            'data': {
                'id': profile.id,
                'wallet_address': profile.wallet_address,
                'username': profile.username,
                'avatar_url': profile.avatar_url,
                'banner_url': profile.banner_url,
                'bio': profile.bio,
                'website': profile.website,
                'twitter': profile.twitter,
                'instagram': profile.instagram,
                'discord': profile.discord,
                'total_created': profile.total_created,
                'total_collected': profile.total_collected,
                'total_volume': float(profile.total_volume) if profile.total_volume else 0,
            }
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_nfts(request):
    """Get all NFTs with pagination and filtering"""
    try:
        # Get query parameters
        page = request.GET.get('page', 1)
        limit = request.GET.get('limit', 12)
        category = request.GET.get('category')
        collection = request.GET.get('collection')
        price_min = request.GET.get('price_min')
        price_max = request.GET.get('price_max')
        sort_by = request.GET.get('sort_by', 'created_at')
        sort_order = request.GET.get('sort_order', 'desc')
        
        # Build query (only visible NFTs - not burned and not hidden)
        nfts = NFT.objects.filter(is_burned=False, is_hidden=False)
        
        if category:
            nfts = nfts.filter(category=category)
        if collection:
            nfts = nfts.filter(collection=collection)
        if price_min:
            nfts = nfts.filter(price__gte=price_min)
        if price_max:
            nfts = nfts.filter(price__lte=price_max)
        
        # Sorting
        if sort_order == 'desc':
            sort_by = f'-{sort_by}'
        nfts = nfts.order_by(sort_by)
        
        # Pagination
        paginator = Paginator(nfts, limit)
        nfts_page = paginator.get_page(page)
        
        # Serialize data
        nfts_data = []
        for nft in nfts_page:
            nfts_data.append({
                'id': nft.id,
                'token_id': nft.token_id,
                'name': nft.name,
                'description': nft.description,
                'image_url': nft.image_url,
                'price': float(nft.price) if nft.price else None,
                'is_listed': nft.is_listed,
                'is_auction': nft.is_auction,
                'auction_end_time': nft.auction_end_time.isoformat() if nft.auction_end_time else None,
                'current_bid': float(nft.current_bid) if nft.current_bid else None,
                'highest_bidder': nft.highest_bidder,
                'owner_address': nft.owner_address,
                'creator_address': nft.creator_address,
                'collection': nft.collection,
                'category': nft.category,
                'created_at': nft.created_at.isoformat(),
            })
        
        return JsonResponse({
            'success': True,
            'data': nfts_data,
            'pagination': {
                'page': nfts_page.number,
                'total_pages': paginator.num_pages,
                'total_items': paginator.count,
                'has_next': nfts_page.has_next(),
                'has_previous': nfts_page.has_previous(),
            }
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_nft_detail(request, token_id):
    """Get detailed information about a specific NFT"""
    try:
        nft = NFT.objects.get(token_id=token_id, is_burned=False, is_hidden=False)
        
        # Get blockchain data
        blockchain_data = web3_instance.get_nft_metadata(token_id)
        
        nft_data = {
            'id': nft.id,
            'token_id': nft.token_id,
            'name': nft.name,
            'description': nft.description,
            'image_url': nft.image_url,
            'token_uri': nft.token_uri,
            'price': float(nft.price) if nft.price else None,
            'is_listed': nft.is_listed,
            'is_auction': nft.is_auction,
            'auction_end_time': nft.auction_end_time.isoformat() if nft.auction_end_time else None,
            'current_bid': float(nft.current_bid) if nft.current_bid else None,
            'highest_bidder': nft.highest_bidder,
            'owner_address': nft.owner_address,
            'creator_address': nft.creator_address,
            'royalty_percentage': float(nft.royalty_percentage),
            'collection': nft.collection,
            'category': nft.category,
            'created_at': nft.created_at.isoformat(),
            'blockchain_data': blockchain_data,
        }
        
        return JsonResponse({
            'success': True,
            'data': nft_data
        })
    except NFT.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'NFT not found'
        }, status=404)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_collections(request):
    """Get all collections"""
    try:
        collections = Collection.objects.all()
        
        collections_data = []
        for collection in collections:
            collections_data.append({
                'id': collection.id,
                'name': collection.name,
                'description': collection.description,
                'creator_address': collection.creator_address,
                'image_url': collection.image_url,
                'banner_url': collection.banner_url,
                'floor_price': float(collection.floor_price) if collection.floor_price else None,
                'total_volume': float(collection.total_volume),
                'total_items': collection.total_items,
                'created_at': collection.created_at.isoformat(),
            })
        
        return JsonResponse({
            'success': True,
            'data': collections_data
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_user_nfts(request, wallet_address):
    """Get NFTs collected by a user (owned or created, no duplicates)"""
    try:
        # NFTs where user is owner
        owned_nfts = NFT.objects.filter(owner_address=wallet_address)
        # NFTs where user is creator
        created_nfts = NFT.objects.filter(creator_address=wallet_address)
        # Combine and deduplicate by token_id
        nft_dict = {}
        for nft in owned_nfts:
            nft_dict[nft.token_id] = nft
        for nft in created_nfts:
            nft_dict[nft.token_id] = nft
        nfts = list(nft_dict.values())
        nfts_data = []
        for nft in nfts:
            nfts_data.append({
                'id': nft.id,
                'token_id': nft.token_id,
                'name': nft.name,
                'description': nft.description,
                'image_url': nft.image_url,
                'price': float(nft.price) if nft.price else None,
                'is_listed': nft.is_listed,
                'is_auction': nft.is_auction,
                'owner_address': nft.owner_address,
                'creator_address': nft.creator_address,
                'collection': nft.collection,
                'category': nft.category,
                'created_at': nft.created_at.isoformat(),
            })
        return JsonResponse({
            'success': True,
            'data': nfts_data
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_user_created_nfts(request, wallet_address):
    """Get NFTs created by a user"""
    try:
        print(f"[DEBUG] get_user_created_nfts called with wallet_address: {wallet_address}")
        nfts = NFT.objects.filter(creator_address=wallet_address)
        print(f"[DEBUG] Number of NFTs found: {nfts.count()}")
        nfts_data = []
        for nft in nfts:
            print(f"[DEBUG] NFT: id={nft.id}, token_id={nft.token_id}, name={nft.name}, creator_address={nft.creator_address}")
            nfts_data.append({
                'id': nft.id,
                'token_id': nft.token_id,
                'name': nft.name,
                'description': nft.description,
                'image_url': nft.image_url,
                'price': float(nft.price) if nft.price else None,
                'is_listed': nft.is_listed,
                'is_auction': nft.is_auction,
                'owner_address': nft.owner_address,
                'creator_address': nft.creator_address,
                'collection': nft.collection,
                'category': nft.category,
                'created_at': nft.created_at.isoformat(),
            })
        return JsonResponse({
            'success': True,
            'data': nfts_data
        })
    except Exception as e:
        print(f"[ERROR] get_user_created_nfts: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_contract_info(request):
    """Get contract information"""
    try:
        contract_info = web3_instance.get_contract_info()
        
        return JsonResponse({
            'success': True,
            'data': contract_info
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def upload_ipfs(request):
    """Upload a file to IPFS"""
    try:
        print("[API] Starting IPFS upload request")
        print(f"[API] Content type: {request.content_type}")
        print(f"[API] Available files: {list(request.FILES.keys())}")
        
        if 'file' not in request.FILES:
            print("[API] No file found in request")
            return JsonResponse({
                'success': False,
                'error': 'No file provided'
            }, status=400)
            
        file = request.FILES['file']
        print(f"[API] File name: {file.name}")
        print(f"[API] File size: {file.size} bytes")
        print(f"[API] File content type: {file.content_type}")
        
        ipfs_hash = upload_to_ipfs(file.read())
        
        return JsonResponse({
            'success': True,
            'ipfsHash': ipfs_hash
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def search_nfts(request):
    """Search NFTs by name, description, or collection"""
    try:
        query = request.GET.get('q', '')
        if not query:
            return JsonResponse({
                'success': False,
                'error': 'Search query is required'
            }, status=400)
        
        nfts = NFT.objects.filter(
            Q(name__icontains=query) |
            Q(description__icontains=query) |
            Q(collection__icontains=query)
        )
        
        nfts_data = []
        for nft in nfts:
            nfts_data.append({
                'id': nft.id,
                'token_id': nft.token_id,
                'name': nft.name,
                'description': nft.description,
                'image_url': nft.image_url,
                'price': float(nft.price) if nft.price else None,
                'is_listed': nft.is_listed,
                'owner_address': nft.owner_address,
                'creator_address': nft.creator_address,
                'collection': nft.collection,
                'category': nft.category,
                'created_at': nft.created_at.isoformat(),
            })
        
        return JsonResponse({
            'success': True,
            'data': nfts_data
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_trending_collections(request):
    """Get trending collections based on volume"""
    try:
        collections = Collection.objects.filter(total_volume__gt=0).order_by('-total_volume')[:10]
        
        collections_data = []
        for collection in collections:
            collections_data.append({
                'id': collection.id,
                'name': collection.name,
                'description': collection.description,
                'image_url': collection.image_url,
                'floor_price': float(collection.floor_price) if collection.floor_price else None,
                'total_volume': float(collection.total_volume),
                'total_items': collection.total_items,
            })
        
        return JsonResponse({
            'success': True,
            'data': collections_data
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_collections_by_likes(request):
    """Get collections ranked by total likes (descending). Returns basic collection info and like counts."""
    try:
        # Aggregate total likes per collection name from Favorites
        aggregates = (
            Favorite.objects
            .values('nft__collection')
            .annotate(total_likes=Count('id'))
            .order_by('-total_likes')
        )

        results = []
        for agg in aggregates:
            # Skip entries without a collection name
            if not agg['nft__collection']:
                continue
            collection_name = agg['nft__collection']
            total_likes = agg['total_likes']

            # Derive additional info from NFTs under this collection
            nfts_qs = NFT.objects.filter(collection=agg['nft__collection'])
            total_items = nfts_qs.count()
            if total_items == 0:
                # No local NFTs, skip
                continue
            # Floor price across NFTs that have a price
            floor_price = nfts_qs.exclude(price__isnull=True).aggregate(min_price=Min('price'))['min_price']
            # Distinct owners count
            owners_count = nfts_qs.values('owner_address').distinct().count()
            # Use the most recent NFT image as the collection image if no Collection record exists
            top_nft = nfts_qs.order_by('-id').first()
            image_url = None
            banner_url = None

            # If a Collection model exists with this name, prefer its media
            try:
                col = Collection.objects.get(name=collection_name)
                image_url = col.image_url or (top_nft.image_url if top_nft else None)
                banner_url = col.banner_url
                creator_address = col.creator_address
                total_volume = float(col.total_volume) if col.total_volume else 0
            except Collection.DoesNotExist:
                image_url = top_nft.image_url if top_nft else None
                banner_url = None
                creator_address = top_nft.creator_address if top_nft else ''
                # Optional: compute simple total volume across transactions for this collection
                total_volume = float(
                    Transaction.objects.filter(
                        nft__collection=agg['nft__collection'],
                        transaction_type__in=['buy', 'sale'],
                        price__isnull=False
                    ).aggregate(total=Sum('price'))['total'] or 0
                )

            results.append({
                'name': collection_name,
                'description': '',
                'creator_address': creator_address,
                'image_url': image_url,
                'banner_url': banner_url,
                'floor_price': float(floor_price) if floor_price is not None else None,
                'total_volume': total_volume,
                'total_items': total_items,
                'total_likes': total_likes,
                'owners_count': owners_count,
            })

        return JsonResponse({'success': True, 'data': results})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)



@csrf_exempt
@require_http_methods(["POST"])
def register_nft(request):
    """Register a newly minted NFT in the backend database"""
    try:
        data = json.loads(request.body)
        print("[DEBUG] register_nft payload:", data)
        nft, created = NFT.objects.get_or_create(
            token_id=data['token_id'],
            defaults={
                'name': data['name'],
                'description': data['description'],
                'image_url': data['image_url'],
                'token_uri': data.get('token_uri', ''),
                'creator_address': data['creator_address'],
                'owner_address': data['owner_address'],
                'price': data.get('price'),
                'is_listed': data.get('is_listed', False),
                'is_auction': data.get('is_auction', False),
                'collection': data.get('collection'),
                'category': data.get('category'),
            }
        )
        print("[DEBUG] NFT created:", created, "NFT:", nft)
        return JsonResponse({'success': True, 'created': created, 'nft_id': nft.id})
    except Exception as e:
        print("[ERROR] register_nft:", str(e))
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def update_nft_owner(request, token_id):
    """Update NFT owner in the database.

    Default: reads on-chain owner via web3 and updates if changed.
    Simulation: if POST body includes 'new_owner', we force-update owner to this
    address and optionally record a transaction. This is useful for testing UI
    without requiring on-chain funds.
    """
    try:
        from .models import NFT, Transaction
        data = json.loads(request.body) if request.body else {}
        forced_new_owner = data.get('new_owner')

        nft = NFT.objects.get(token_id=token_id)
        old_owner = nft.owner_address

        if forced_new_owner:
            new_owner = forced_new_owner
        else:
            from .web3_utils import web3_instance
            new_owner = web3_instance.get_nft_owner(token_id)
            if not new_owner:
                return JsonResponse({'success': False, 'error': 'Could not fetch owner from blockchain'}, status=400)

        # Only proceed if the owner actually changes
        if old_owner != new_owner:
            nft.owner_address = new_owner
            # If this was a simulated transfer, also mark NFT as not listed
            if forced_new_owner:
                nft.is_listed = False
            nft.save()

            tx_hash = data.get('transaction_hash', '') or (f"simulated_{token_id}_{int(time.time())}" if forced_new_owner else '')
            price = data.get('price', None)
            block_number = data.get('block_number', 0)
            gas_used = data.get('gas_used', 0)
            gas_price = data.get('gas_price', 0)

            # Create Transaction record
            Transaction.objects.create(
                transaction_hash=tx_hash,
                nft=nft,
                from_address=old_owner,
                to_address=new_owner,
                transaction_type='buy',
                price=price,
                block_number=block_number,
                gas_used=gas_used,
                gas_price=gas_price,
                timestamp=timezone.now()
            )
        return JsonResponse({'success': True, 'owner_address': new_owner})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def toggle_nft_like(request, nft_id):
    """Toggle like/unlike for an NFT and return current like status and count"""
    try:
        data = json.loads(request.body)
        user_address = data.get('user_address')
        if not user_address:
            return JsonResponse({'success': False, 'error': 'User address required'}, status=400)
        # Handle combined ID format (local_1, local_2, etc.)
        if isinstance(nft_id, str):
            if nft_id.startswith('local_'):
                actual_id = nft_id.replace('local_', '')
                try:
                    nft = NFT.objects.get(id=actual_id)
                except NFT.DoesNotExist:
                    nft = NFT.objects.get(token_id=actual_id)
                # Handle local NFT likes
                favorite, created = Favorite.objects.get_or_create(
                    user_address=user_address,
                    nft=nft
                )
                if not created:
                    # If already exists, unlike it
                    favorite.delete()
                    liked = False
                else:
                    liked = True
                # Always return the current like status and count
                like_count = Favorite.objects.filter(nft=nft).count()
                return JsonResponse({
                    'success': True,
                    'liked': liked,
                    'like_count': like_count
                })
        return JsonResponse({'success': False, 'error': 'Only local NFTs are supported'}, status=400)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def set_nft_listed(request, token_id):
    """Set is_listed to true for an NFT, but only if it is listed on-chain."""
    from .models import NFT
    from .web3_utils import web3_instance
    try:
        nft = NFT.objects.get(token_id=token_id)
        # Check on-chain listing status
        contract = web3_instance.get_nftmarketplace_contract()
        is_listed = contract.functions.isListed(token_id).call()
        if is_listed:
            nft.is_listed = True
            nft.save()
            return JsonResponse({'success': True, 'is_listed': True})
        else:
            return JsonResponse({'success': False, 'error': 'NFT is not listed on-chain'}, status=400)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_combined_nfts(request):
    """Get NFTs from local database only"""
    try:
        print("[DEBUG] get_combined_nfts called")
        
        # Get user address from query params for like status
        user_address = request.GET.get('user_address')
        print(f"[DEBUG] User address for like status: {user_address}")
        
        # Get user's liked NFTs if address provided
        liked_nft_ids = set()
        if user_address:
            try:
                # Get local NFT likes
                favorites = Favorite.objects.filter(user_address=user_address)
                liked_nft_ids = set(favorites.values_list('nft__id', flat=True))
                print(f"[DEBUG] User liked {len(liked_nft_ids)} local NFTs")
            except Exception as e:
                print(f"[ERROR] Failed to get user likes: {str(e)}")
        
        # Get local NFTs
        local_nfts = NFT.objects.all()[:50]  # Increased limit since no OpenSea NFTs
        print(f"[DEBUG] Found {local_nfts.count()} local NFTs")
        
        local_nfts_data = []
        for nft in local_nfts:
            # Compute like count per NFT
            like_count = Favorite.objects.filter(nft=nft).count()
            local_nfts_data.append({
                'id': f"local_{nft.id}",
                'token_id': nft.token_id,
                'name': nft.name,
                'description': nft.description,
                'image_url': nft.image_url,
                'price': float(nft.price) if nft.price else None,
                'is_listed': nft.is_listed,
                'is_auction': nft.is_auction,
                'owner_address': nft.owner_address,
                'creator_address': nft.creator_address,
                'collection': nft.collection,
                'category': nft.category,
                'created_at': nft.created_at.isoformat(),
                'source': 'local',
                'liked': nft.id in liked_nft_ids,
                'like_count': like_count
            })
        
        print(f"[DEBUG] Processed {len(local_nfts_data)} local NFTs")
        
        # Optional sorting
        sort_key = request.GET.get('sort')
        if sort_key == 'likes':
            local_nfts_data.sort(key=lambda x: x.get('like_count', 0), reverse=True)
        else:
            # Shuffle the NFTs for variety if no explicit sort
            import random
            random.shuffle(local_nfts_data)
        
        print(f"[DEBUG] Total NFTs: {len(local_nfts_data)}")
        print(f"[DEBUG] Sample NFT IDs: {[nft['id'] for nft in local_nfts_data[:3]]}")
        print(f"[DEBUG] First NFT full data: {local_nfts_data[0] if local_nfts_data else 'No NFTs'}")

        return JsonResponse({
            'success': True,
            'data': local_nfts_data,
            'stats': {
                'local_count': len(local_nfts_data),
                'total_count': len(local_nfts_data)
            }
        })
    except Exception as e:
        print(f"[ERROR] get_combined_nfts: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_activities(request):
    """Get all activities/transactions with filtering and pagination"""
    try:
        # Get query parameters
        page = request.GET.get('page', 1)
        limit = request.GET.get('limit', 20)
        activity_type = request.GET.get('type')  # mint, list, buy, bid, transfer, delist
        time_filter = request.GET.get('time_filter', '24h')  # 1h, 24h, 7d, 30d
        search_query = request.GET.get('search', '')
        
        # Build query
        activities = Transaction.objects.select_related('nft').all()
        
        # Filter by activity type
        if activity_type and activity_type != 'all':
            activities = activities.filter(transaction_type=activity_type)
        
        # Filter by time
        now = timezone.now()
        if time_filter == '1h':
            activities = activities.filter(timestamp__gte=now - timedelta(hours=1))
        elif time_filter == '24h':
            activities = activities.filter(timestamp__gte=now - timedelta(days=1))
        elif time_filter == '7d':
            activities = activities.filter(timestamp__gte=now - timedelta(days=7))
        elif time_filter == '30d':
            activities = activities.filter(timestamp__gte=now - timedelta(days=30))
        
        # Search functionality
        if search_query:
            activities = activities.filter(
                Q(nft__name__icontains=search_query) |
                Q(nft__collection__icontains=search_query) |
                Q(from_address__icontains=search_query) |
                Q(to_address__icontains=search_query)
            )
        
        # Order by timestamp (newest first)
        activities = activities.order_by('-timestamp')
        
        # Pagination
        paginator = Paginator(activities, limit)
        activities_page = paginator.get_page(page)
        
        # Serialize data
        activities_data = []
        for activity in activities_page:
            # Get user profiles for from and to addresses
            try:
                from_profile = UserProfile.objects.get(wallet_address=activity.from_address)
                from_username = from_profile.username or f"User{activity.from_address[-4:]}"
            except UserProfile.DoesNotExist:
                from_username = f"User{activity.from_address[-4:]}"
            
            try:
                to_profile = UserProfile.objects.get(wallet_address=activity.to_address)
                to_username = to_profile.username or f"User{activity.to_address[-4:]}"
            except UserProfile.DoesNotExist:
                to_username = f"User{activity.to_address[-4:]}"
            
            # Calculate time ago
            time_diff = timezone.now() - activity.timestamp
            if time_diff.days > 0:
                time_ago = f"{time_diff.days} days ago"
            elif time_diff.seconds > 3600:
                hours = time_diff.seconds // 3600
                time_ago = f"{hours} hours ago"
            else:
                minutes = time_diff.seconds // 60
                time_ago = f"{minutes} minutes ago"
            
            # Handle different activity types
            if activity.transaction_type in ['follow', 'unfollow']:
                # For follow/unfollow actions, no NFT involved
                activities_data.append({
                    'id': activity.id,
                    'type': activity.transaction_type,
                    'nft': None,
                    'from': {
                        'address': activity.from_address,
                        'name': from_username,
                        'avatar': f"https://images.unsplash.com/photo-147209{9645785 + activity.id}?w=32&h=32&fit=crop&crop=face"
                    },
                    'to': {
                        'address': activity.to_address,
                        'name': to_username,
                        'avatar': f"https://images.unsplash.com/photo-147209{9645785 + activity.id + 100}?w=32&h=32&fit=crop&crop=face"
                    },
                    'price': None,
                    'timestamp': activity.timestamp.isoformat(),
                    'time_ago': time_ago,
                    'transaction_hash': activity.transaction_hash,
                    'block_number': activity.block_number,
                })
            else:
                # For NFT-related activities
                activities_data.append({
                    'id': activity.id,
                    'type': activity.transaction_type,
                    'nft': {
                        'id': activity.nft.id if activity.nft else None,
                        'name': activity.nft.name if activity.nft else 'Unknown NFT',
                        'image_url': activity.nft.image_url if activity.nft else '',
                        'collection': activity.nft.collection if activity.nft else 'Unknown Collection',
                        'token_id': activity.nft.token_id if activity.nft else None
                    },
                    'from': {
                        'address': activity.from_address,
                        'name': from_username,
                        'avatar': f"https://images.unsplash.com/photo-147209{9645785 + activity.id}?w=32&h=32&fit=crop&crop=face"
                    },
                    'to': {
                        'address': activity.to_address,
                        'name': to_username,
                        'avatar': f"https://images.unsplash.com/photo-147209{9645785 + activity.id + 100}?w=32&h=32&fit=crop&crop=face"
                    },
                    'price': float(activity.price) if activity.price else None,
                    'timestamp': activity.timestamp.isoformat(),
                    'time_ago': time_ago,
                    'transaction_hash': activity.transaction_hash,
                    'block_number': activity.block_number,
                'gas_used': activity.gas_used,
                'gas_price': float(activity.gas_price) if activity.gas_price else None
            })
        
        return JsonResponse({
            'success': True,
            'data': activities_data,
            'pagination': {
                'page': activities_page.number,
                'total_pages': paginator.num_pages,
                'total_items': paginator.count,
                'has_next': activities_page.has_next(),
                'has_previous': activities_page.has_previous(),
            }
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_activity_stats(request):
    """Get activity statistics"""
    try:
        now = timezone.now()
        
        # Get counts for different time periods
        last_24h = now - timedelta(days=1)
        last_7d = now - timedelta(days=7)
        last_30d = now - timedelta(days=30)
        
        stats = {
            'last_24h': {
                'total': Transaction.objects.filter(timestamp__gte=last_24h).count(),
                'sales': Transaction.objects.filter(timestamp__gte=last_24h, transaction_type='buy').count(),
                'listings': Transaction.objects.filter(timestamp__gte=last_24h, transaction_type='list').count(),
                'mints': Transaction.objects.filter(timestamp__gte=last_24h, transaction_type='mint').count(),
                'transfers': Transaction.objects.filter(timestamp__gte=last_24h, transaction_type='transfer').count(),
                'offers': Transaction.objects.filter(timestamp__gte=last_24h, transaction_type='bid').count(),
            },
            'last_7d': {
                'total': Transaction.objects.filter(timestamp__gte=last_7d).count(),
                'sales': Transaction.objects.filter(timestamp__gte=last_7d, transaction_type='buy').count(),
                'listings': Transaction.objects.filter(timestamp__gte=last_7d, transaction_type='list').count(),
                'mints': Transaction.objects.filter(timestamp__gte=last_7d, transaction_type='mint').count(),
                'transfers': Transaction.objects.filter(timestamp__gte=last_7d, transaction_type='transfer').count(),
                'offers': Transaction.objects.filter(timestamp__gte=last_7d, transaction_type='bid').count(),
            },
            'last_30d': {
                'total': Transaction.objects.filter(timestamp__gte=last_30d).count(),
                'sales': Transaction.objects.filter(timestamp__gte=last_30d, transaction_type='buy').count(),
                'listings': Transaction.objects.filter(timestamp__gte=last_30d, transaction_type='list').count(),
                'mints': Transaction.objects.filter(timestamp__gte=last_30d, transaction_type='mint').count(),
                'transfers': Transaction.objects.filter(timestamp__gte=last_30d, transaction_type='transfer').count(),
                'offers': Transaction.objects.filter(timestamp__gte=last_30d, transaction_type='bid').count(),
            }
        }
        
        return JsonResponse({
            'success': True,
            'data': stats
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def follow_user(request, wallet_address):
    try:
        data = json.loads(request.body)
        follower_address = data.get('follower_address')
        if not follower_address:
            return JsonResponse({'success': False, 'error': 'Missing follower_address'}, status=400)
        
        # Get or create user profiles
        user, user_created = UserProfile.objects.get_or_create(
            wallet_address=wallet_address,
            defaults={'username': f"User{wallet_address[-4:]}"}
        )
        follower, follower_created = UserProfile.objects.get_or_create(
            wallet_address=follower_address,
            defaults={'username': f"User{follower_address[-4:]}"}
        )
        
        # Check if already following
        if user.followers.filter(wallet_address=follower_address).exists():
            return JsonResponse({'success': False, 'error': 'Already following this user'}, status=400)
        
        # Add follower
        user.followers.add(follower)
        
        # Create activity for the user being followed
        try:
            from .models import Transaction
            Transaction.objects.create(
                transaction_hash=f"follow_{follower_address}_{wallet_address}_{int(time.time())}",
                nft=None,  # No NFT involved in follow action
                from_address=follower_address,
                to_address=wallet_address,
                transaction_type='follow',
                price=None,
                block_number=0,
                gas_used=0,
                gas_price=0,
                timestamp=timezone.now()
            )
        except Exception as activity_error:
            print(f"[WARNING] Failed to create follow activity: {activity_error}")
        
        return JsonResponse({
            'success': True, 
            'followers_count': user.followers.count(),
            'following_count': follower.following.count()
        })
    except Exception as e:
        print(f"[ERROR] follow_user: {str(e)}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def unfollow_user(request, wallet_address):
    try:
        data = json.loads(request.body)
        follower_address = data.get('follower_address')
        if not follower_address:
            return JsonResponse({'success': False, 'error': 'Missing follower_address'}, status=400)
        
        # Get user profiles
        user = UserProfile.objects.get(wallet_address=wallet_address)
        follower = UserProfile.objects.get(wallet_address=follower_address)
        
        # Check if not following
        if not user.followers.filter(wallet_address=follower_address).exists():
            return JsonResponse({'success': False, 'error': 'Not following this user'}, status=400)
        
        # Remove follower
        user.followers.remove(follower)
        
        # Create activity for the user being unfollowed
        try:
            from .models import Transaction
            Transaction.objects.create(
                transaction_hash=f"unfollow_{follower_address}_{wallet_address}_{int(time.time())}",
                nft=None,  # No NFT involved in unfollow action
                from_address=follower_address,
                to_address=wallet_address,
                transaction_type='unfollow',
                price=None,
                block_number=0,
                gas_used=0,
                gas_price=0,
                timestamp=timezone.now()
            )
        except Exception as activity_error:
            print(f"[WARNING] Failed to create unfollow activity: {activity_error}")
        
        return JsonResponse({
            'success': True, 
            'followers_count': user.followers.count(),
            'following_count': follower.following.count()
        })
    except Exception as e:
        print(f"[ERROR] unfollow_user: {str(e)}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_followers(request, wallet_address):
    try:
        user = UserProfile.objects.get(wallet_address=wallet_address)
        followers = list(user.followers.values('wallet_address', 'username', 'avatar_url'))
        return JsonResponse({'success': True, 'followers': followers, 'count': len(followers)})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_following(request, wallet_address):
    try:
        user = UserProfile.objects.get(wallet_address=wallet_address)
        following = list(user.following.values('wallet_address', 'username', 'avatar_url'))
        return JsonResponse({'success': True, 'following': following, 'count': len(following)})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_nft_by_combined_id(request, combined_id):
    """Get NFT details by combined ID (handles both local and OpenSea NFTs)"""
    try:
        print(f"[DEBUG] get_nft_by_combined_id called with id: {combined_id}")
        
        # Check if this is a local NFT (has "local_" prefix)
        if combined_id.startswith('local_'):
            # Extract the actual ID from the local ID
            actual_id = combined_id.replace('local_', '')
            print(f"[DEBUG] Local NFT detected, actual_id: {actual_id}")
            
            try:
                # Try to find by database ID first, then by token_id
                try:
                    nft = NFT.objects.get(id=actual_id)
                except NFT.DoesNotExist:
                    nft = NFT.objects.get(token_id=actual_id)
                
                # Get blockchain data
                blockchain_data = web3_instance.get_nft_metadata(nft.token_id)
                
                nft_data = {
                    'id': f"local_{nft.id}",
                    'token_id': nft.token_id,
                    'name': nft.name,
                    'description': nft.description,
                    'image_url': nft.image_url,
                    'token_uri': nft.token_uri,
                    'price': float(nft.price) if nft.price else None,
                    'is_listed': nft.is_listed,
                    'is_auction': nft.is_auction,
                    'auction_end_time': nft.auction_end_time.isoformat() if nft.auction_end_time else None,
                    'current_bid': float(nft.current_bid) if nft.current_bid else None,
                    'highest_bidder': nft.highest_bidder,
                    'owner_address': nft.owner_address,
                    'creator_address': nft.creator_address,
                    'royalty_percentage': float(nft.royalty_percentage),
                    'collection': nft.collection,
                    'category': nft.category,
                    'created_at': nft.created_at.isoformat(),
                    'blockchain_data': blockchain_data,
                    'source': 'local'
                }
                
                return JsonResponse({
                    'success': True,
                    'data': nft_data
                })
            except NFT.DoesNotExist:
                return JsonResponse({
                    'success': False,
                    'error': 'Local NFT not found'
                }, status=404)
        else:
            # Only local NFTs are supported now
            return JsonResponse({
                'success': False,
                'error': 'Only local NFTs are supported'
            }, status=404)
                
    except Exception as e:
        print(f"[ERROR] get_nft_by_combined_id: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_nft_stats(request, nft_id):
    """Get NFT statistics including views, likes, owners, and properties"""
    try:
        # Extract the actual NFT ID from combined ID (e.g., "local_1" -> 1)
        if nft_id.startswith('local_'):
            actual_nft_id = nft_id.replace('local_', '')
        else:
            actual_nft_id = nft_id
            
        try:
            # Try to find by database ID first, then by token_id
            try:
                nft = NFT.objects.get(id=actual_nft_id)
            except NFT.DoesNotExist:
                nft = NFT.objects.get(token_id=actual_nft_id)
        except NFT.DoesNotExist:
            return JsonResponse({
                'success': False,
                'error': 'NFT not found'
            }, status=404)
        
        # Get likes count
        likes_count = Favorite.objects.filter(nft=nft).count()
        
        # Get owners count (for now, just 1 since we don't track ownership history)
        owners_count = 1
        
        # Get last sale info
        last_sale = Transaction.objects.filter(
            nft=nft, 
            transaction_type__in=['buy', 'sale']
        ).order_by('-timestamp').first()
        
        last_sale_info = 'No sales yet'
        if last_sale and last_sale.price:
            last_sale_info = f"Ξ{float(last_sale.price)}"
        
        # Calculate total volume
        total_volume = Transaction.objects.filter(
            nft=nft,
            transaction_type__in=['buy', 'sale'],
            price__isnull=False
        ).aggregate(total=Sum('price'))['total'] or 0
        
        total_volume_str = f"Ξ{float(total_volume)}" if total_volume > 0 else "0 ETH"
        
        # Mock properties for now (you can extend this based on your NFT metadata)
        properties = []
        if nft.description:
            # Extract some basic properties from description or create mock ones
            properties = [
                {"trait_type": "Rarity", "value": "Common", "rarity": "45%"},
                {"trait_type": "Category", "value": nft.category or "Art", "rarity": "30%"},
                {"trait_type": "Collection", "value": nft.collection or "Unknown", "rarity": "25%"}
            ]
        
        # Get real views count
        views_count = nft.views.count()
        
        stats_data = {
            'views': views_count,
            'likes': likes_count,
            'owners': owners_count,
            'last_sale': last_sale_info,
            'total_volume': total_volume_str,
            'properties': properties
        }
        
        return JsonResponse({
            'success': True,
            'data': stats_data
        })
        
    except Exception as e:
        print(f"[ERROR] get_nft_stats: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_user_liked_nfts(request, wallet_address):
    """Get all NFTs liked by a specific user"""
    try:
        print(f"[DEBUG] get_user_liked_nfts called for user: {wallet_address}")
        
        # Get local NFT favorites
        favorites = Favorite.objects.filter(user_address=wallet_address)
        print(f"[DEBUG] Found {favorites.count()} local favorites for user")
        

        
        liked_nfts = []
        
        # Process local NFT favorites
        for favorite in favorites:
            nft = favorite.nft
            nft_data = {
                'id': f"local_{nft.id}",
                'token_id': nft.token_id,
                'name': nft.name,
                'description': nft.description,
                'image_url': nft.image_url,
                'price': float(nft.price) if nft.price else None,
                'is_listed': nft.is_listed,
                'is_auction': nft.is_auction,
                'owner_address': nft.owner_address,
                'creator_address': nft.creator_address,
                'collection': nft.collection,
                'category': nft.category,
                'created_at': nft.created_at.isoformat() if nft.created_at else None,
                'source': 'local',
                'liked': True,  # These are all liked since they're from favorites
                'favorited_at': favorite.created_at.isoformat() if favorite.created_at else None
            }
            liked_nfts.append(nft_data)
        

        
        print(f"[DEBUG] Returning {len(liked_nfts)} total liked NFTs ({len(favorites)} local)")
        return JsonResponse({
            'success': True,
            'data': liked_nfts,
            'count': len(liked_nfts)
        })
    except Exception as e:
        print(f"[ERROR] get_user_liked_nfts: {str(e)}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def track_nft_view(request, nft_id):
    """Track an NFT view"""
    try:
        # Get or create the NFT
        if nft_id.startswith('local_'):
            actual_id = nft_id.replace('local_', '')
            try:
                nft = NFT.objects.get(id=actual_id)
            except NFT.DoesNotExist:
                nft = NFT.objects.get(token_id=actual_id)
        else:
            nft = NFT.objects.get(token_id=nft_id)
        
        # Get viewer information
        data = json.loads(request.body) if request.body else {}
        viewer_address = data.get('viewer_address')
        
        # Get IP address
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip_address = x_forwarded_for.split(',')[0]
        else:
            ip_address = request.META.get('REMOTE_ADDR')
        
        # Get user agent
        user_agent = request.META.get('HTTP_USER_AGENT', '')
        
        # Create view record (will fail silently if duplicate due to unique constraint)
        try:
            from .models import NFTView
            NFTView.objects.create(
                nft=nft,
                viewer_address=viewer_address,
                ip_address=ip_address,
                user_agent=user_agent
            )
        except Exception as view_error:
            # This is expected for duplicate views
            print(f"[INFO] Duplicate view or view creation failed: {view_error}")
        
        # Return updated view count
        view_count = nft.views.count()
        
        return JsonResponse({
            'success': True,
            'view_count': view_count
        })
        
    except Exception as e:
        print(f"[ERROR] track_nft_view: {str(e)}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def burn_nft(request, token_id):
    """Burn an NFT (only by creator, never sold)"""
    try:
        data = json.loads(request.body) if request.body else {}
        creator_address = data.get('creator_address')
        
        if not creator_address:
            return JsonResponse({'success': False, 'error': 'Creator address required'}, status=400)
        
        try:
            nft = NFT.objects.get(token_id=token_id)
        except NFT.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'NFT not found'}, status=404)
        
        # Check if creator can burn this NFT
        if not nft.can_be_burned:
            return JsonResponse({
                'success': False, 
                'error': 'NFT cannot be burned. Must be unsold and owned by creator.'
            }, status=403)
        
        if nft.creator_address.lower() != creator_address.lower():
            return JsonResponse({'success': False, 'error': 'Only the creator can burn this NFT'}, status=403)
        
        # Mark as burned in database
        nft.is_burned = True
        nft.burned_at = timezone.now()
        nft.save()
        
        # Create burn transaction record
        Transaction.objects.create(
            transaction_hash=f"burn_{token_id}_{int(time.time())}",
            nft=nft,
            from_address=creator_address,
            to_address='0x000000000000000000000000000000000000dEaD',  # Dead address
            transaction_type='burn',
            price=None,
            block_number=0,
            gas_used=0,
            gas_price=0,
            timestamp=timezone.now()
        )
        
        return JsonResponse({
            'success': True, 
            'message': 'NFT burned successfully',
            'token_id': token_id
        })
        
    except Exception as e:
        print(f"[ERROR] burn_nft: {str(e)}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def hide_nft(request, token_id):
    """Hide an NFT from marketplace (by creator or admin)"""
    try:
        data = json.loads(request.body) if request.body else {}
        user_address = data.get('user_address')
        reason = data.get('reason', 'Hidden by user')
        is_admin = data.get('is_admin', False)
        
        if not user_address:
            return JsonResponse({'success': False, 'error': 'User address required'}, status=400)
        
        try:
            nft = NFT.objects.get(token_id=token_id)
        except NFT.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'NFT not found'}, status=404)
        
        # Check if NFT can be hidden
        if not nft.can_be_hidden:
            return JsonResponse({
                'success': False, 
                'error': 'NFT cannot be hidden (already burned or hidden)'
            }, status=403)
        
        # Only creator or admin can hide
        can_hide = (
            nft.creator_address.lower() == user_address.lower() or
            nft.owner_address.lower() == user_address.lower() or
            is_admin
        )
        
        if not can_hide:
            return JsonResponse({
                'success': False, 
                'error': 'Only creator, owner, or admin can hide this NFT'
            }, status=403)
        
        # Hide the NFT
        nft.is_hidden = True
        nft.hidden_at = timezone.now()
        nft.hidden_reason = reason
        nft.save()
        
        # Create hide transaction record
        Transaction.objects.create(
            transaction_hash=f"hide_{token_id}_{int(time.time())}",
            nft=nft,
            from_address=user_address,
            to_address=user_address,
            transaction_type='hide',
            price=None,
            block_number=0,
            gas_used=0,
            gas_price=0,
            timestamp=timezone.now()
        )
        
        return JsonResponse({
            'success': True, 
            'message': 'NFT hidden successfully',
            'token_id': token_id
        })
        
    except Exception as e:
        print(f"[ERROR] hide_nft: {str(e)}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def unhide_nft(request, token_id):
    """Unhide an NFT (restore visibility)"""
    try:
        data = json.loads(request.body) if request.body else {}
        user_address = data.get('user_address')
        is_admin = data.get('is_admin', False)
        
        if not user_address:
            return JsonResponse({'success': False, 'error': 'User address required'}, status=400)
        
        try:
            nft = NFT.objects.get(token_id=token_id)
        except NFT.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'NFT not found'}, status=404)
        
        # Check if NFT is hidden
        if not nft.is_hidden:
            return JsonResponse({'success': False, 'error': 'NFT is not hidden'}, status=400)
        
        # Only creator, owner, or admin can unhide
        can_unhide = (
            nft.creator_address.lower() == user_address.lower() or
            nft.owner_address.lower() == user_address.lower() or
            is_admin
        )
        
        if not can_unhide:
            return JsonResponse({
                'success': False, 
                'error': 'Only creator, owner, or admin can unhide this NFT'
            }, status=403)
        
        # Unhide the NFT
        nft.is_hidden = False
        nft.hidden_at = None
        nft.hidden_reason = None
        nft.save()
        
        # Create unhide transaction record
        Transaction.objects.create(
            transaction_hash=f"unhide_{token_id}_{int(time.time())}",
            nft=nft,
            from_address=user_address,
            to_address=user_address,
            transaction_type='unhide',
            price=None,
            block_number=0,
            gas_used=0,
            gas_price=0,
            timestamp=timezone.now()
        )
        
        return JsonResponse({
            'success': True, 
            'message': 'NFT unhidden successfully',
            'token_id': token_id
        })
        
    except Exception as e:
        print(f"[ERROR] unhide_nft: {str(e)}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)
