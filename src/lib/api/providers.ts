import { ipc } from '../ipc';
import type { ProviderView } from '@/types/bindings/ProviderView';
import type { ProviderInput } from '@/types/bindings/ProviderInput';
import type { ProviderTestInput } from '@/types/bindings/ProviderTestInput';
import type { ConnectionTest } from '@/types/bindings/ConnectionTest';
export const providerApi = {
  list: () => ipc<ProviderView[]>('provider_list'),
  save: (input: ProviderInput) => ipc<ProviderView>('provider_save', input),
  delete: (id: string) => ipc<void>('provider_delete', { id }),
  setDefault: (id: string) => ipc<void>('provider_set_default', { id }),
  test: (input: ProviderTestInput) =>
    ipc<ConnectionTest>('provider_test', input),
  models: (input: ProviderTestInput) =>
    ipc<string[]>('provider_fetch_models', input),
};
