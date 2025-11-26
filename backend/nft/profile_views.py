from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
import json
import base64
from .models import UserProfile

@csrf_exempt
@require_http_methods(["POST"])
def update_profile(request, wallet_address):
    """Update user profile including profile and cover images"""
    try:
        data = json.loads(request.body)
        
        # Get or create user profile
        profile, created = UserProfile.objects.get_or_create(
            wallet_address=wallet_address
        )

        # Handle profile image
        if 'profile_image' in data:
            image_data = data['profile_image']
            if image_data.startswith('data:image'):
                # Remove the data:image/[type];base64 prefix
                format, imgstr = image_data.split(';base64,')
                ext = format.split('/')[-1]
                
                # Generate unique filename
                filename = f'profile_{wallet_address}.{ext}'
                
                # Save the file
                file_data = ContentFile(base64.b64decode(imgstr))
                file_path = default_storage.save(f'profile_images/{filename}',file_data)
                
                # Update profile
                profile.avatar_url = f"https://nftminter-api.infiwebsolutions.com{default_storage.url(file_path)}"

        # Handle cover image
        if 'cover_image' in data:
            image_data = data['cover_image']
            if image_data.startswith('data:image'):
                format, imgstr = image_data.split(';base64,')
                ext = format.split('/')[-1]
                filename = f'cover_{wallet_address}.{ext}'
                file_data = ContentFile(base64.b64decode(imgstr))
                file_path = default_storage.save(f'cover_images/{filename}',file_data)
                profile.banner_url = f"https://nftminter-api.infiwebsolutions.com{default_storage.url(file_path)}"

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
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)
