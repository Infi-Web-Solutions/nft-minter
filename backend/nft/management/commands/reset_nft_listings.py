from django.core.management.base import BaseCommand
from nft.models import NFT

class Command(BaseCommand):
    help = 'Reset all NFT is_listed flags to False.'

    def handle(self, *args, **options):
        updated = NFT.objects.update(is_listed=False)
        self.stdout.write(self.style.SUCCESS(f'Successfully reset is_listed for {updated} NFTs.'))