// Global test setup
import { vi } from 'vitest';

// Mock environment variables for tests
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-minimum-length-for-validation';
process.env.FAL_KEY = 'test-fal-key';
process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-posthog-key';

// Suppress console noise in tests
vi.spyOn(console, 'warn').mockImplementation(() => {});
