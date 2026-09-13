import { forwardRef, useImperativeHandle, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '../ui/Button'
import { Label, Textarea, FieldError } from '../ui/Input'
import { useAutoSave } from '../../hooks/useAutoSave'
import { today } from '../../utils/date'

const schema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日付の形式が正しくありません')
    .refine((d) => d <= today(), { message: '未来の日付は選択できません' }),
  body: z.string().min(1, '本文を入力してください'),
})

type FormValues = z.infer<typeof schema>

export interface EntryFormHandle {
  getCreatedDate: () => string | null
  save: () => Promise<void>
  isAutoCreated: () => boolean
}

interface EntryFormProps {
  defaultValues?: Partial<FormValues>
  onSubmit: (values: FormValues) => Promise<void>
  submitLabel?: string
  dateReadOnly?: boolean
  autoSaveExistingDate?: string
  autoSaveInitialVersion?: number
  onDateChange?: (date: string) => void
}

export const EntryForm = forwardRef<EntryFormHandle, EntryFormProps>(
  function EntryForm(
    {
      defaultValues,
      onSubmit,
      submitLabel = '投稿する',
      dateReadOnly = false,
      autoSaveExistingDate,
      autoSaveInitialVersion,
      onDateChange,
    },
    ref,
  ) {
    const {
      register,
      handleSubmit,
      watch,
      setValue,
      formState: { errors, isSubmitting },
    } = useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { date: today(), ...defaultValues },
    })

    const watchedDate = watch('date')
    const watchedBody = watch('body')

    const {
      status: autoSaveStatus,
      autoCreated,
      getCreatedDate,
      save,
      reloadFromServer,
      forceSave,
    } = useAutoSave({
      date: watchedDate ?? '',
      body: watchedBody ?? '',
      existingDate: autoSaveExistingDate,
      initialBody: defaultValues?.body,
      initialVersion: autoSaveInitialVersion,
    })

    useImperativeHandle(ref, () => ({ getCreatedDate, save, isAutoCreated: () => autoCreated }))

    useEffect(() => {
      onDateChange?.(watchedDate)
    }, [watchedDate, onDateChange])

    const handleReload = async () => {
      try {
        const { body: latestBody } = await reloadFromServer()
        // 読み込み直した内容を「初期値」として扱い、直後の自動保存の変化検知対象から外す
        setValue('body', latestBody, { shouldDirty: false })
      } catch (e) {
        // 失敗してもstatusは'conflict'のままなのでバナーは表示され続け、再試行できる
        console.error('最新の内容の取得に失敗しました', e)
      }
    }

    const handleForceSave = async () => {
      if (!window.confirm('サーバー上の他の変更を上書きして保存します。よろしいですか？')) return
      try {
        await forceSave()
      } catch {
        // 再度409だった場合はstatusが'conflict'に戻り、バナーが表示され続ける
      }
    }

    return (
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <Label htmlFor="date" required>日付</Label>
          <input
            id="date"
            type="date"
            max={today()}
            readOnly={dateReadOnly || autoCreated}
            className={`block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900 shadow-sm
              focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500 sm:text-sm
              ${dateReadOnly || autoCreated ? 'bg-stone-50 cursor-not-allowed' : ''}`}
            {...register('date')}
          />
          <FieldError message={errors.date?.message} />
        </div>

        <div>
          <Label htmlFor="body" required>本文</Label>
          <Textarea
            id="body"
            rows={14}
            placeholder="今日の出来事を書いてみましょう..."
            {...register('body')}
          />
          <FieldError message={errors.body?.message} />
        </div>

        {autoSaveStatus === 'conflict' && (
          <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            <p>他のタブ/端末での変更を検知しました。このまま保存すると上書きされる可能性があります。</p>
            <div className="mt-2 flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={handleReload}>
                最新の内容を読み込み直す
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleForceSave}>
                このまま自分の内容で保存する
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-4">
          <Button type="submit" loading={isSubmitting} disabled={autoSaveStatus === 'conflict'} size="lg">
            {submitLabel}
          </Button>
          <span className="text-xs text-stone-400">
            {autoSaveStatus === 'saving' && '自動保存中...'}
            {autoSaveStatus === 'saved' && '自動保存しました'}
            {autoSaveStatus === 'error' && (
              <span className="text-red-400">自動保存に失敗しました</span>
            )}
          </span>
        </div>
      </form>
    )
  },
)
