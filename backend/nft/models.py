from django.db import models
from django.contrib.auth.models import User

class UserProfile(models.Model):
    id = models.AutoField(primary_key=True)  # Explicit id field
    wallet_address = models.CharField(max_length=42, unique=True)
    username = models.CharField(max_length=255, null=True, blank=True)
    avatar_url = models.URLField(null=True, blank=True)
    banner_url = models.URLField(null=True, blank=True)
    bio = models.TextField(null=True, blank=True)
    website = models.URLField(null=True, blank=True)
    twitter = models.CharField(max_length=255, null=True, blank=True)
    instagram = models.CharField(max_length=255, null=True, blank=True)
    discord = models.CharField(max_length=255, null=True, blank=True)
    total_created = models.IntegerField(default=0)
    total_collected = models.IntegerField(default=0)
    total_volume = models.DecimalField(max_digits=18, decimal_places=8, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    following = models.ManyToManyField('self', symmetrical=False, related_name='followers', blank=True)

    class Meta:
        db_table = 'user_profiles'

    def __str__(self):
        return f"Profile: {self.wallet_address}"

class NFT(models.Model):
    token_id = models.IntegerField(unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField()
    image_url = models.URLField()
    token_uri = models.URLField()
    owner_address = models.CharField(max_length=42)  # Ethereum address
    creator_address = models.CharField(max_length=42)
    price = models.DecimalField(max_digits=18, decimal_places=8, null=True, blank=True)
    is_listed = models.BooleanField(default=False)
    is_auction = models.BooleanField(default=False)
    auction_end_time = models.DateTimeField(null=True, blank=True)
    current_bid = models.DecimalField(max_digits=18, decimal_places=8, null=True, blank=True)
    highest_bidder = models.CharField(max_length=42, null=True, blank=True)
    royalty_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    collection = models.CharField(max_length=255, null=True, blank=True)
    category = models.CharField(max_length=100, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'nfts'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} (Token ID: {self.token_id})"

class Collection(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField()
    creator_address = models.CharField(max_length=42)
    image_url = models.URLField(null=True, blank=True)
    banner_url = models.URLField(null=True, blank=True)
    floor_price = models.DecimalField(max_digits=18, decimal_places=8, null=True, blank=True)
    total_volume = models.DecimalField(max_digits=18, decimal_places=8, default=0)
    total_items = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'collections'
        ordering = ['-total_volume']

    def __str__(self):
        return self.name



class Transaction(models.Model):
    TRANSACTION_TYPES = [
        ('mint', 'Mint'),
        ('list', 'List'),
        ('buy', 'Buy'),
        ('bid', 'Bid'),
        ('transfer', 'Transfer'),
        ('delist', 'Delist'),
        ('follow', 'Follow'),
        ('unfollow', 'Unfollow'),
    ]

    transaction_hash = models.CharField(max_length=66, unique=True)
    nft = models.ForeignKey(NFT, on_delete=models.CASCADE, null=True, blank=True)
    from_address = models.CharField(max_length=42)
    to_address = models.CharField(max_length=42)
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    price = models.DecimalField(max_digits=18, decimal_places=8, null=True, blank=True)
    block_number = models.IntegerField()
    gas_used = models.IntegerField()
    gas_price = models.DecimalField(max_digits=18, decimal_places=8)
    timestamp = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'transactions'
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.transaction_type} - {self.transaction_hash[:10]}..."

class Favorite(models.Model):
    user_address = models.CharField(max_length=42, default='0x0000000000000000000000000000000000000000')
    nft = models.ForeignKey(NFT, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'favorites'
        unique_together = ['user_address', 'nft']

    def __str__(self):
        return f"{self.user_address} ❤️ {self.nft.name}"

class NFTView(models.Model):
    nft = models.ForeignKey(NFT, on_delete=models.CASCADE, related_name='views')
    viewer_address = models.CharField(max_length=42, null=True, blank=True)  # Can be null for anonymous views
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(null=True, blank=True)
    viewed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'nft_views'
        ordering = ['-viewed_at']
        unique_together = ['nft', 'viewer_address', 'ip_address']  # Prevent duplicate views from same user/IP

    def __str__(self):
        return f"{self.nft.name} viewed by {self.viewer_address or self.ip_address}"


