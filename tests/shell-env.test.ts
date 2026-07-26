import { describe, it, expect } from 'vitest';
import { shellEnv } from '../server/src/shell-env';

describe('shellEnv', () => {
  it('passes ordinary variables through untouched', () => {
    const env = shellEnv({ HOME: '/home/cilli', PATH: '/usr/bin', LANG: 'en_US.UTF-8' });
    expect(env).toEqual({ HOME: '/home/cilli', PATH: '/usr/bin', LANG: 'en_US.UTF-8' });
  });

  it('drops ELECTRON_RUN_AS_NODE so nested Electron apps still open a window', () => {
    const env = shellEnv({ HOME: '/h', ELECTRON_RUN_AS_NODE: '1' });
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(env.HOME).toBe('/h');
  });

  it('drops every CILITERM_ variable so a nested server is not preconfigured', () => {
    const env = shellEnv({
      CILITERM_DESKTOP: '1',
      CILITERM_PORT: '8787',
      CILITERM_TOKEN: 'secret',
      CILITERM_CLIENT_DIST: '/app/web',
      PATH: '/usr/bin',
    });
    expect(Object.keys(env)).toEqual(['PATH']);
  });

  it('keeps unrelated ELECTRON_ variables the user set themselves', () => {
    const env = shellEnv({ ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/' });
    expect(env.ELECTRON_MIRROR).toBe('https://npmmirror.com/mirrors/electron/');
  });

  it('ignores undefined values', () => {
    const env = shellEnv({ HOME: '/h', EMPTY: undefined });
    expect('EMPTY' in env).toBe(false);
  });

  describe('under an AppImage', () => {
    it('removes bundled directories from path-like variables', () => {
      const env = shellEnv({
        APPDIR: '/tmp/.mount_cili',
        LD_LIBRARY_PATH: '/tmp/.mount_cili/usr/lib:/usr/lib/x86_64-linux-gnu',
      });
      expect(env.LD_LIBRARY_PATH).toBe('/usr/lib/x86_64-linux-gnu');
    });

    it('drops the variable entirely when only bundled entries remain', () => {
      const env = shellEnv({
        APPDIR: '/tmp/.mount_cili',
        LD_LIBRARY_PATH: '/tmp/.mount_cili/usr/lib',
      });
      expect('LD_LIBRARY_PATH' in env).toBe(false);
    });

    it('prefers the pristine value the runtime saved', () => {
      const env = shellEnv({
        APPDIR: '/tmp/.mount_cili',
        LD_LIBRARY_PATH: '/tmp/.mount_cili/usr/lib:/opt/lib',
        LD_LIBRARY_PATH_ORIG: '/original/lib',
      });
      expect(env.LD_LIBRARY_PATH).toBe('/original/lib');
    });

    it('does not touch path-like variables when not running from an AppImage', () => {
      const env = shellEnv({ LD_LIBRARY_PATH: '/tmp/.mount_cili/usr/lib:/usr/lib' });
      expect(env.LD_LIBRARY_PATH).toBe('/tmp/.mount_cili/usr/lib:/usr/lib');
    });

    it('leaves XDG_DATA_DIRS usable for desktop integration', () => {
      const env = shellEnv({
        APPDIR: '/tmp/.mount_cili',
        XDG_DATA_DIRS: '/tmp/.mount_cili/usr/share:/usr/local/share:/usr/share',
      });
      expect(env.XDG_DATA_DIRS).toBe('/usr/local/share:/usr/share');
    });
  });
});
