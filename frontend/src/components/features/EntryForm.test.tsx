import { createRef } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EntryForm, type EntryFormHandle } from './EntryForm'
import { useAutoSave } from '../../hooks/useAutoSave'

vi.mock('../../hooks/useAutoSave')

const mockUseAutoSave = vi.mocked(useAutoSave)

const baseAutoSave = {
  status: 'idle' as const,
  autoCreated: false,
  getCreatedDate: () => null,
  save: vi.fn().mockResolvedValue(undefined),
  reloadFromServer: vi.fn(),
  forceSave: vi.fn().mockResolvedValue(undefined),
}

describe('EntryForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAutoSave.mockReturnValue({ ...baseAutoSave })
  })

  it('conflict状態でなければ競合バナーを表示しない', () => {
    render(<EntryForm onSubmit={vi.fn()} defaultValues={{ body: '本文' }} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('autoSaveStatusがconflictのとき競合バナーを表示する', () => {
    mockUseAutoSave.mockReturnValue({ ...baseAutoSave, status: 'conflict' })
    render(<EntryForm onSubmit={vi.fn()} defaultValues={{ body: '本文' }} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '最新の内容を読み込み直す' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'このまま自分の内容で保存する' })).toBeInTheDocument()
  })

  it('「最新の内容を読み込み直す」クリックで本文フィールドがreloadFromServerの返り値に置き換わる', async () => {
    const reloadFromServer = vi.fn().mockResolvedValue({ body: 'サーバー側の最新内容', version: 5 })
    mockUseAutoSave.mockReturnValue({ ...baseAutoSave, status: 'conflict', reloadFromServer })

    render(<EntryForm onSubmit={vi.fn()} defaultValues={{ body: '自分の入力内容' }} />)

    fireEvent.click(screen.getByRole('button', { name: '最新の内容を読み込み直す' }))

    await waitFor(() => {
      expect(screen.getByLabelText(/本文/)).toHaveValue('サーバー側の最新内容')
    })
    expect(reloadFromServer).toHaveBeenCalledTimes(1)
  })

  it('「このまま自分の内容で保存する」は確認ダイアログでキャンセルするとforceSaveを呼ばない', () => {
    const forceSave = vi.fn().mockResolvedValue(undefined)
    mockUseAutoSave.mockReturnValue({ ...baseAutoSave, status: 'conflict', forceSave })
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<EntryForm onSubmit={vi.fn()} defaultValues={{ body: '本文' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'このまま自分の内容で保存する' }))

    expect(forceSave).not.toHaveBeenCalled()
  })

  it('「このまま自分の内容で保存する」は確認ダイアログで承認するとforceSaveを呼ぶ', async () => {
    const forceSave = vi.fn().mockResolvedValue(undefined)
    mockUseAutoSave.mockReturnValue({ ...baseAutoSave, status: 'conflict', forceSave })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<EntryForm onSubmit={vi.fn()} defaultValues={{ body: '本文' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'このまま自分の内容で保存する' }))

    await waitFor(() => expect(forceSave).toHaveBeenCalledTimes(1))
  })

  it('EntryFormHandle.save/isAutoCreated がuseAutoSaveの戻り値を反映する', () => {
    const save = vi.fn().mockResolvedValue(undefined)
    mockUseAutoSave.mockReturnValue({ ...baseAutoSave, save, autoCreated: true })
    const ref = createRef<EntryFormHandle>()

    render(<EntryForm ref={ref} onSubmit={vi.fn()} defaultValues={{ body: '本文' }} />)

    expect(ref.current?.isAutoCreated()).toBe(true)
    ref.current?.save()
    expect(save).toHaveBeenCalledTimes(1)
  })
})
