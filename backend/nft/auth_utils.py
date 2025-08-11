from django.contrib.auth.models import User
from .models import UserProfile

def get_or_create_web3_user(wallet_address):
    """
    Get or create a User and UserProfile for a Web3 wallet address
    """
    # Create or get a user for this wallet address
    username = f"user_{wallet_address[:8]}"
    user, user_created = User.objects.get_or_create(
        username=username,
        defaults={
            'email': f"{username}@example.com"
        }
    )
    
    if user_created:
        # Set an unusable password since these users won't login traditionally
        user.set_unusable_password()
        user.save()
    
    # Get or create the profile
    profile, profile_created = UserProfile.objects.get_or_create(
        wallet_address=wallet_address,
        defaults={'user': user}
    )
    
    return profile, profile_created
