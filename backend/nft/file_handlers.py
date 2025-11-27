import os
import base64
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

BASE_URL = os.environ.get('URL')

def handle_profile_image(profile, image_data, wallet_address, request):
    """Handle profile image upload"""
    if not image_data.startswith('data:image'):
        return None
        
    # Get old file path if exists to delete later
    old_avatar = profile.avatar_url.split('/')[-1] if profile.avatar_url else None
    
    format, imgstr = image_data.split(';base64,')
    ext = format.split('/')[-1]
    filename = f'profile_{wallet_address}.{ext}'
    file_data = ContentFile(base64.b64decode(imgstr))
    
    # Ensure directory exists
    os.makedirs(os.path.join(settings.MEDIA_ROOT, 'profile_images'), exist_ok=True)
    
    file_path = default_storage.save(f'profile_images/{filename}', file_data)
    url = f"{BASE_URL}{default_storage.url(file_path)}"
    
    # Delete old file if exists
    if old_avatar:
        old_path = os.path.join(settings.MEDIA_ROOT, 'profile_images', old_avatar)
        if os.path.exists(old_path):
            os.remove(old_path)
            
    return url

def handle_cover_image(profile, image_data, wallet_address, request):
    """Handle cover image upload"""
    if not image_data.startswith('data:image'):
        return None
        
    # Get old file path if exists to delete later
    old_banner = profile.banner_url.split('/')[-1] if profile.banner_url else None
    
    format, imgstr = image_data.split(';base64,')
    ext = format.split('/')[-1]
    filename = f'cover_{wallet_address}.{ext}'
    file_data = ContentFile(base64.b64decode(imgstr))
    
    # Ensure directory exists
    os.makedirs(os.path.join(settings.MEDIA_ROOT, 'cover_images'), exist_ok=True)
    
    file_path = default_storage.save(f'cover_images/{filename}', file_data)
    url = f"{BASE_URL}{default_storage.url(file_path)}"
    
    # Delete old file if exists
    if old_banner:
        old_path = os.path.join(settings.MEDIA_ROOT, 'cover_images', old_banner)
        if os.path.exists(old_path):
            os.remove(old_path)
            
    return url
