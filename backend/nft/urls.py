from django.urls import path
from . import views, profile_views
from .views import set_nft_listed, follow_user, unfollow_user, get_followers, get_following

app_name = 'nft'

urlpatterns = [
    # NFT endpoints
    path('nfts/', views.get_nfts, name='get_nfts'),
    path('nfts/<int:token_id>/', views.get_nft_detail, name='get_nft_detail'),
    path('nfts/combined/<str:combined_id>/', views.get_nft_by_combined_id, name='get_nft_by_combined_id'),
    path('nfts/search/', views.search_nfts, name='search_nfts'),
    path('nfts/register/', views.register_nft, name='register_nft'),
    path('nfts/<int:token_id>/transfer/', views.update_nft_owner, name='update_nft_owner'),
    path('nfts/<str:nft_id>/toggle-like/', views.toggle_nft_like, name='toggle_nft_like'),
    path('nfts/<str:nft_id>/stats/', views.get_nft_stats, name='get_nft_stats'),
    path('nfts/<str:nft_id>/track-view/', views.track_nft_view, name='track_nft_view'),
    path('nfts/combined/', views.get_combined_nfts, name='get_combined_nfts'),
    # NFT Management endpoints
    path('nfts/<int:token_id>/burn/', views.burn_nft, name='burn_nft'),
    path('nfts/<int:token_id>/hide/', views.hide_nft, name='hide_nft'),
    path('nfts/<int:token_id>/unhide/', views.unhide_nft, name='unhide_nft'),
    
    # Collection endpoints
    path('collections/', views.get_collections, name='get_collections'),
    path('collections/trending/', views.get_trending_collections, name='get_trending_collections'),
    path('collections/by-likes/', views.get_collections_by_likes, name='get_collections_by_likes'),
    
    # User endpoints
    path('profiles/<str:wallet_address>/', views.get_user_profile, name='get_user_profile'),
    path('profiles/<str:wallet_address>/update/', views.update_profile, name='update_profile'),
    path('profiles/<str:wallet_address>/nfts/', views.get_user_nfts, name='get_user_nfts'),
    path('profiles/<str:wallet_address>/created/', views.get_user_created_nfts, name='get_user_created_nfts'),
    path('profiles/<str:wallet_address>/liked/', views.get_user_liked_nfts, name='get_user_liked_nfts'),
    path('profiles/<str:wallet_address>/follow/', follow_user, name='follow_user'),
    path('profiles/<str:wallet_address>/unfollow/', unfollow_user, name='unfollow_user'),
    path('profiles/<str:wallet_address>/followers/', get_followers, name='get_followers'),
    path('profiles/<str:wallet_address>/following/', get_following, name='get_following'),
    
    # Contract endpoints
    path('contract/info/', views.get_contract_info, name='get_contract_info'),
    
    # IPFS endpoints
    path('upload/ipfs/', views.upload_ipfs, name='upload_ipfs'),

    # Activity endpoints
    path('activities/', views.get_activities, name='get_activities'),
    path('activities/stats/', views.get_activity_stats, name='get_activity_stats'),


]

urlpatterns += [
    path('nfts/<int:token_id>/set_listed/', set_nft_listed, name='set_nft_listed'),
] 