import type { UpdateUserProfileInput, UserProfile } from '@/entities/profile';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useUpdateMyProfile } from '@/entities/profile';
import { countryName, ISO_3166_ALPHA3_CODES } from '@/entities/organisation';
import type { IsoAlpha3 } from '@repo/contracts/organisations';
import { HttpError } from '@/shared/api';
import {
  Button,
  DatePicker,
  FormField,
  FormMessage,
  Input,
  Label,
  RichTextEditor,
  emptyDelta,
  isEmpty,
  type Delta,
} from '@/shared/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.js';

export interface ProfileFormProps {
  /** The profile to seed the form from (the empty shape when not yet filled). */
  profile: UserProfile;
  /**
   * Optional callback fired after a successful save. The page uses this to
   * refresh the better-auth session so the sidebar picks up the synced
   * `user.name` without a reload.
   */
  onSaved?: () => void;
}

/** A sentinel `Select` value for the "no country" option (Select needs a non-empty string). */
const NONE = '__none__';

/**
 * Full-page form for editing the signed-in user's own profile. Empty-string
 * text/date inputs are submitted as `null` so a user can clear a field.
 */
export function ProfileForm({ profile, onSaved }: ProfileFormProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const [firstName, setFirstName] = React.useState<string>(profile.firstName ?? '');
  const [lastName, setLastName] = React.useState<string>(profile.lastName ?? '');
  const [dateOfBirth, setDateOfBirth] = React.useState<string>(profile.dateOfBirth ?? '');
  const [taidoStartDate, setTaidoStartDate] = React.useState<string>(
    profile.taidoStartDate ?? '',
  );
  const [addressStreet, setAddressStreet] = React.useState<string>(profile.addressStreet ?? '');
  const [addressPostalCode, setAddressPostalCode] = React.useState<string>(
    profile.addressPostalCode ?? '',
  );
  const [addressCity, setAddressCity] = React.useState<string>(profile.addressCity ?? '');
  const [addressCountry, setAddressCountry] = React.useState<string>(
    profile.addressCountry ?? NONE,
  );
  const [citizenships, setCitizenships] = React.useState<string[]>(profile.citizenships);
  const [pendingCitizenship, setPendingCitizenship] = React.useState<string>('');
  const [aboutMe, setAboutMe] = React.useState<Delta>(
    (profile.aboutMe as Delta | null) ?? emptyDelta(),
  );
  const [submitError, setSubmitError] = React.useState<string | undefined>();
  const [saved, setSaved] = React.useState(false);

  /** Country options sorted by localised label. */
  const countryOptions = React.useMemo(
    () =>
      ISO_3166_ALPHA3_CODES.map((code) => ({ code, label: countryName(code, locale) })).sort(
        (a, b) => a.label.localeCompare(b.label, locale),
      ),
    [locale],
  );

  /** Country options not yet chosen as a citizenship. */
  const availableCitizenshipOptions = React.useMemo(
    () => countryOptions.filter((o) => !citizenships.includes(o.code)),
    [countryOptions, citizenships],
  );

  const update = useUpdateMyProfile({
    onSuccess: () => {
      setSaved(true);
      setSubmitError(undefined);
      onSaved?.();
    },
    onError: (err) => {
      setSaved(false);
      setSubmitError(
        err instanceof HttpError
          ? err.message
          : t('common.unknownError', { defaultValue: 'Unknown error' }),
      );
    },
  });

  const addCitizenship = (): void => {
    if (!pendingCitizenship || citizenships.includes(pendingCitizenship)) return;
    setCitizenships([...citizenships, pendingCitizenship]);
    setPendingCitizenship('');
  };

  const removeCitizenship = (code: string): void => {
    setCitizenships(citizenships.filter((c) => c !== code));
  };

  /** Convert a text input value to `null` when blank, else the trimmed string. */
  const orNull = (v: string): string | null => {
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const handleSubmit = (event: React.SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setSaved(false);
    setSubmitError(undefined);
    const input: UpdateUserProfileInput = {
      firstName: orNull(firstName),
      lastName: orNull(lastName),
      dateOfBirth: orNull(dateOfBirth),
      taidoStartDate: orNull(taidoStartDate),
      addressStreet: orNull(addressStreet),
      addressPostalCode: orNull(addressPostalCode),
      addressCity: orNull(addressCity),
      addressCountry: addressCountry === NONE ? null : addressCountry,
      citizenships,
      aboutMe: isEmpty(aboutMe) ? null : aboutMe,
    };
    update.mutate(input);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FormField>
        <Label htmlFor="profile-first-name">{t('profile.fields.firstName')}</Label>
        <Input
          id="profile-first-name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
      </FormField>

      <FormField>
        <Label htmlFor="profile-last-name">{t('profile.fields.lastName')}</Label>
        <Input
          id="profile-last-name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
      </FormField>

      <FormField>
        <Label htmlFor="profile-dob">{t('profile.fields.dateOfBirth')}</Label>
        <DatePicker
          id="profile-dob"
          value={dateOfBirth}
          onChange={setDateOfBirth}
          aria-label={t('profile.fields.dateOfBirth')}
        />
      </FormField>

      <FormField>
        <Label htmlFor="profile-taido-start">{t('profile.fields.taidoStartDate')}</Label>
        <DatePicker
          id="profile-taido-start"
          value={taidoStartDate}
          onChange={setTaidoStartDate}
          aria-label={t('profile.fields.taidoStartDate')}
        />
      </FormField>

      <FormField>
        <Label htmlFor="profile-street">{t('profile.fields.addressStreet')}</Label>
        <Input
          id="profile-street"
          value={addressStreet}
          onChange={(e) => setAddressStreet(e.target.value)}
        />
      </FormField>

      <FormField>
        <Label htmlFor="profile-postal">{t('profile.fields.addressPostalCode')}</Label>
        <Input
          id="profile-postal"
          value={addressPostalCode}
          onChange={(e) => setAddressPostalCode(e.target.value)}
        />
      </FormField>

      <FormField>
        <Label htmlFor="profile-city">{t('profile.fields.addressCity')}</Label>
        <Input
          id="profile-city"
          value={addressCity}
          onChange={(e) => setAddressCity(e.target.value)}
        />
      </FormField>

      <FormField>
        <Label htmlFor="profile-country">{t('profile.fields.addressCountry')}</Label>
        <Select value={addressCountry} onValueChange={setAddressCountry}>
          <SelectTrigger id="profile-country" aria-label={t('profile.fields.addressCountry')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t('profile.countryNone')}</SelectItem>
            {countryOptions.map((o) => (
              <SelectItem key={o.code} value={o.code}>
                {o.label} ({o.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField>
        <Label>{t('profile.fields.citizenships')}</Label>
        {citizenships.length === 0 ? null : (
          <ul className="divide-y">
            {citizenships.map((code) => (
              <li key={code} className="flex items-center justify-between gap-3 py-2">
                <span className="flex-1 truncate text-sm">
                  {countryName(code as IsoAlpha3, locale)} ({code})
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeCitizenship(code)}
                >
                  {t('profile.removeCitizenship')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-3">
          <Select value={pendingCitizenship} onValueChange={setPendingCitizenship}>
            <SelectTrigger className="flex-1" aria-label={t('profile.addCitizenship')}>
              <SelectValue placeholder={t('profile.addCitizenship')} />
            </SelectTrigger>
            <SelectContent>
              {availableCitizenshipOptions.map((o) => (
                <SelectItem key={o.code} value={o.code}>
                  {o.label} ({o.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCitizenship}
            disabled={!pendingCitizenship}
          >
            {t('profile.addCitizenship')}
          </Button>
        </div>
      </FormField>

      <FormField>
        <Label htmlFor="profile-about-me">{t('profile.fields.aboutMe')}</Label>
        <RichTextEditor
          id="profile-about-me"
          value={aboutMe}
          onChange={setAboutMe}
          ariaLabel={t('profile.fields.aboutMe')}
          placeholder={t('profile.aboutMePlaceholder')}
        />
      </FormField>

      <FormMessage message={submitError} />
      {saved ? (
        <p role="status" className="text-sm text-on-surface-variant">
          {t('profile.saved')}
        </p>
      ) : null}

      <Button type="submit" disabled={update.isPending}>
        {t('profile.save')}
      </Button>
    </form>
  );
}
