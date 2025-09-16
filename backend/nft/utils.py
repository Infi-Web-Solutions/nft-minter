import os
from django.conf import settings
from django.core.exceptions import ValidationError

def validate_file_size(file_data):
    """
    Validate that the file size is within the allowed limit
    """
    # Get the size from the base64 string (approximately)
    # Remove the header (data:image/png;base64,) and calculate size
    if ';base64,' in file_data:
        base64_str = file_data.split(';base64,')[1]
        # Calculate approximate file size (base64 string length * 3/4)
        file_size = len(base64_str) * 3 / 4
        
        if file_size > settings.MAX_UPLOAD_SIZE:
            raise ValidationError(f'File size cannot exceed {settings.MAX_UPLOAD_SIZE/(1024*1024)}MB')
        
    return True

def ensure_directory_exists(path):
    """
    Ensure that the directory exists, create if it doesn't
    """
    if not os.path.exists(path):
        os.makedirs(path)
