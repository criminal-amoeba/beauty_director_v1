import { Appearance } from 'react-native';
import { APPEARANCES, loadAppearance, setAppearance, toAppearance } from '../appearance';

jest.mock('../storage', () => ({ deviceStorage: { getItem: jest.fn(), setItem: jest.fn(async () => {}) } }));

describe('appearance', () => {
  it('reads a stored choice and falls back to the device setting', () => {
    expect(APPEARANCES).toEqual(['system', 'light', 'dark']);
    expect(toAppearance('dark')).toBe('dark');
    expect(toAppearance('light')).toBe('light');
    expect(toAppearance(null)).toBe('system');
    expect(toAppearance('sepia')).toBe('system');
  });

  it('leaves Android alone at boot when the choice is "match device" (the call can recreate the window)', async () => {
    const { deviceStorage } = jest.requireMock('../storage') as { deviceStorage: { getItem: jest.Mock } };
    const spy = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
    deviceStorage.getItem.mockResolvedValueOnce(null);
    await loadAppearance();
    expect(spy).not.toHaveBeenCalled();
    deviceStorage.getItem.mockResolvedValueOnce('dark');
    await loadAppearance();
    expect(spy).toHaveBeenLastCalledWith('dark');
    spy.mockRestore();
  });

  it('applies the choice app-wide; system hands control back to the device', async () => {
    const spy = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
    await setAppearance('dark');
    expect(spy).toHaveBeenLastCalledWith('dark');
    await setAppearance('system');
    expect(spy).toHaveBeenLastCalledWith('unspecified');
  });
});
