import { Room } from '../types';

/**
 * Removes a photo from a room and keeps each asset's `sourceImageIndex` pointing at the same
 * photo it pointed at before. Assets whose source photo was deleted lose the reference rather
 * than silently pointing at a different photo. Asset IDs and all other fields are untouched.
 */
export function removeRoomImage(room: Room, imageId: string): Pick<Room, 'images' | 'assets'> {
  const removedIndex = room.images.findIndex(img => img.id === imageId);
  if (removedIndex < 0) return { images: room.images, assets: room.assets };

  const assets = room.assets.map(asset => {
    const idx = asset.sourceImageIndex;
    if (idx === undefined || idx < removedIndex) return asset;
    if (idx === removedIndex) return { ...asset, sourceImageIndex: undefined };
    return { ...asset, sourceImageIndex: idx - 1 };
  });

  return { images: room.images.filter(img => img.id !== imageId), assets };
}
