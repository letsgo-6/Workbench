import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { providerApi } from '@/lib/api/providers';
import { AppError } from '@/lib/ipc';
import type { ProviderView } from '@/types/bindings/ProviderView';
import { t } from '@/i18n';
import { toast } from 'sonner';
export function ProviderForm({
  provider,
  onClose,
}: {
  provider?: ProviderView;
  onClose: () => void;
}) {
  const [name, setName] = useState(provider?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(
    provider?.baseUrl ?? 'https://api.openai.com/v1',
  );
  const [model, setModel] = useState(provider?.model ?? '');
  const [temperature, setTemperature] = useState(provider?.temperature ?? 0.7);
  const [maxTokens, setMaxTokens] = useState(
    provider?.maxTokens?.toString() ?? '',
  );
  const [apiKey, setApiKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const testInput = {
    providerId: provider?.id ?? null,
    baseUrl,
    model,
    apiKey: clearKey ? '' : apiKey || null,
  };
  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    setNotice('');
    void fn()
      .catch((e: Error) => setNotice(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <form
      className="provider-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          await providerApi.save({
            id: provider?.id ?? null,
            name,
            baseUrl,
            model,
            temperature,
            maxTokens: maxTokens ? Number(maxTokens) : null,
            apiKey: clearKey ? '' : apiKey || null,
          });
          setApiKey('');
          toast.success(t('model.saved'));
          onClose();
        });
      }}
    >
      <h3>{provider?.name ?? t('model.unsaved')}</h3>
      <div className="settings-grid">
        <Field>
          <FieldLabel htmlFor="provider-name">{t('model.name')}</FieldLabel>
          <Input
            id="provider-name"
            required
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="provider-base">{t('model.baseUrl')}</FieldLabel>
          <Input
            id="provider-base"
            type="url"
            required
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="provider-model">{t('model.model')}</FieldLabel>
          <Input
            id="provider-model"
            list="provider-models"
            required
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
          <datalist id="provider-models">
            {models.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
        </Field>
        <Field>
          <FieldLabel htmlFor="provider-key">{t('model.key')}</FieldLabel>
          <Input
            id="provider-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setClearKey(false);
            }}
            placeholder={
              provider?.hasKey ? t('model.optional') : t('model.keyEmpty')
            }
          />
          {provider?.hasKey && (
            <>
              <small>
                {t('model.keyHint', { hint: provider.keyHint ?? '' })}
              </small>
              <label>
                <input
                  type="checkbox"
                  checked={clearKey}
                  onChange={(e) => {
                    setClearKey(e.target.checked);
                    setApiKey('');
                  }}
                />
                {t('model.clearKey')}
              </label>
            </>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="provider-temperature">
            {t('model.temperature')}
          </FieldLabel>
          <Input
            id="provider-temperature"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="provider-tokens">
            {t('model.maxTokens')}
          </FieldLabel>
          <Input
            id="provider-tokens"
            type="number"
            min={1}
            max={1000000}
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
          />
        </Field>
      </div>
      <div className="toolbar-actions">
        <Button type="submit" disabled={busy}>
          {t('model.save')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !model}
          onClick={() =>
            run(async () => {
              const result = await providerApi.test(testInput);
              if (result.ok)
                setNotice(t('model.success', { ms: result.latencyMs }));
              else {
                const error = new AppError(result.error);
                setNotice(
                  error.detail
                    ? `${error.message} ${error.detail}`
                    : error.message,
                );
              }
            })
          }
        >
          {t('model.test')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(async () => {
              setModels(await providerApi.models(testInput));
            })
          }
        >
          {t('model.fetch')}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
      {models.length > 0 && (
        <p>
          {t('model.models')} · {models.join('、')}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </form>
  );
}
