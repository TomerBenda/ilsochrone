import { describe, expect, it } from 'vitest';
import {
  appleMapsUrl,
  buildNavLinks,
  googleMapsUrl,
  moovitUrl,
  osmUrl,
  wazeUrl,
} from './navigation-links';

const DIZENGOFF = { lng: 34.7745, lat: 32.0795, name: 'Dizengoff Center' };
const HOME = { lng: 34.7818, lat: 32.0853 };

describe('navigation-links', () => {
  it('googleMapsUrl includes destination, origin, and mode hint', () => {
    const url = googleMapsUrl(DIZENGOFF, { origin: HOME, mode: 'walk' });
    expect(url).toContain('https://www.google.com/maps/dir/');
    expect(url).toContain('destination=32.0795%2C34.7745');
    expect(url).toContain('origin=32.0853%2C34.7818');
    expect(url).toContain('travelmode=walking');
  });

  it('wazeUrl always uses ll= and navigate=yes', () => {
    expect(wazeUrl(DIZENGOFF)).toBe(
      'https://www.waze.com/ul?ll=32.0795%2C34.7745&navigate=yes',
    );
  });

  it('moovitUrl includes destination with name', () => {
    const url = moovitUrl(DIZENGOFF, { origin: HOME });
    expect(url).toContain('moovitapp.com');
    expect(url).toContain('to=32.0795_34.7745_Dizengoff+Center');
    expect(url).toContain('from=32.0853_34.7818_Origin');
  });

  it('appleMapsUrl encodes daddr and saddr', () => {
    const url = appleMapsUrl(DIZENGOFF, { origin: HOME, mode: 'transit' });
    expect(url).toContain('https://maps.apple.com/');
    expect(url).toContain('daddr=32.0795%2C34.7745');
    expect(url).toContain('saddr=32.0853%2C34.7818');
    expect(url).toContain('dirflg=r');
  });

  it('osmUrl points at the right zoom and marker', () => {
    expect(osmUrl(DIZENGOFF)).toContain('mlat=32.0795');
    expect(osmUrl(DIZENGOFF)).toContain('mlon=34.7745');
  });

  it('buildNavLinks returns providers in the expected order', () => {
    const links = buildNavLinks(DIZENGOFF, { origin: HOME });
    expect(links.map((l) => l.id)).toEqual([
      'google_maps',
      'waze',
      'moovit',
      'apple_maps',
      'osm',
    ]);
  });
});
