import { describe, it, expect } from 'vitest';
import { safeHttpUrl } from './safeUrl';

describe('safeHttpUrl', () => {
  it('allows http and https URLs and returns the normalised href', () => {
    expect(safeHttpUrl('https://example.com/shot.png')).toBe('https://example.com/shot.png');
    expect(safeHttpUrl('http://example.com/a')).toBe('http://example.com/a');
    expect(safeHttpUrl('HTTPS://Example.com/A')).toBe('https://example.com/A'); // scheme+host normalised
    expect(safeHttpUrl('  https://example.com/x  ')).toBe('https://example.com/x'); // trimmed
  });

  it('rejects javascript: URLs', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('JavaScript:alert(1)')).toBeNull();
    expect(safeHttpUrl('  javascript:alert(1)')).toBeNull();
  });

  it('rejects data: URLs', () => {
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHttpUrl('data:image/png;base64,AAAA')).toBeNull();
  });

  it('rejects other unsupported schemes', () => {
    expect(safeHttpUrl('blob:https://example.com/uuid')).toBeNull();
    expect(safeHttpUrl('file:///etc/passwd')).toBeNull();
    expect(safeHttpUrl('mailto:a@b.com')).toBeNull();
    expect(safeHttpUrl('ftp://example.com/x')).toBeNull();
    expect(safeHttpUrl('vbscript:msgbox(1)')).toBeNull();
  });

  it('rejects malformed, relative, protocol-relative, empty and non-string values', () => {
    expect(safeHttpUrl('not a url')).toBeNull();
    expect(safeHttpUrl('/relative/path.png')).toBeNull();
    expect(safeHttpUrl('//example.com/x')).toBeNull(); // protocol-relative
    expect(safeHttpUrl('')).toBeNull();
    expect(safeHttpUrl('   ')).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
    expect(safeHttpUrl(123)).toBeNull();
    expect(safeHttpUrl({})).toBeNull();
  });
});
