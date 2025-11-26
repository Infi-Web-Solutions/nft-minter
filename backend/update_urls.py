from nft.models import UserProfile

OLD_HOSTS = [
    'http://localhost:8000',
    'https://localhost:8000',
    'http://127.0.0.1:8000',
    'https://127.0.0.1:8000',
]

NEW_HOST = 'https://nftminter-api.infiwebsolutions.com'

updated = 0

for profile in UserProfile.objects.all():
    changed = False

    # Update avatar URLs
    if profile.avatar_url:
        for old in OLD_HOSTS:
            if old in profile.avatar_url:
                profile.avatar_url = profile.avatar_url.replace(old, NEW_HOST)
                changed = True

    # Update banner URLs
    if profile.banner_url:
        for old in OLD_HOSTS:
            if old in profile.banner_url:
                profile.banner_url = profile.banner_url.replace(old, NEW_HOST)
                changed = True

    if changed:
        profile.save()
        updated += 1

print(f'Updated profiles: {updated}')

