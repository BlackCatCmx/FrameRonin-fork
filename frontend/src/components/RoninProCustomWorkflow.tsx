import { Fragment, useCallback, useEffect, useState, type CSSProperties } from 'react'
import {
  Button,
  Checkbox,
  Col,
  Input,
  InputNumber,
  message,
  Row,
  Space,
  Typography,
  Upload,
} from 'antd'
import { ExpandOutlined, OrderedListOutlined } from '@ant-design/icons'
import { useLanguage } from '../i18n/context'
import {
  WORKFLOW_PALETTE,
  buildDefaultRearrangeGrid,
  createGraphNode,
  getExecutionOrder,
  parseWorkflowGraph,
  resizeRearrangeGrid,
  runWorkflowOnBlob,
  sanitizeWorkflowPresetFileBase,
  serializeWorkflowGraph,
  type GraphNode,
  type WorkflowEdge,
  type WorkflowNodeType,
} from '../lib/roninProWorkflow'
import WorkflowBlueprintCanvas, {
  getBlueprintNodeWidth,
  getCustomRearrangeInputWidth,
} from './WorkflowBlueprintCanvas'

const { Dragger } = Upload
const { Text } = Typography

const STORAGE_KEY = 'roninProCustomWorkflow.v3'
const IMAGE_ACCEPT = ['.png', '.jpg', '.jpeg', '.webp']

/** 右侧预设节点浮窗（fixed，不随画布滚动） */
const PALETTE_FLOAT_OUTER: CSSProperties = {
  position: 'fixed',
  right: 16,
  top: 'max(72px, 8vh)',
  bottom: 24,
  width: 'min(320px, calc(100vw - 32px))',
  zIndex: 500,
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
  padding: 12,
  gap: 10,
  background: 'var(--ant-color-bg-container)',
  borderRadius: 12,
  boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06)',
  border: '1px solid var(--ant-color-border-secondary)',
}

const PALETTE_FLOAT_SCROLL: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  paddingRight: 2,
}

const NODE_LABEL_I18N: Record<WorkflowNodeType, string> = {
  geminiWatermarkRemove: 'roninProWorkflowNode_geminiWatermarkRemove',
  resize: 'roninProWorkflowNode_resize',
  crop: 'roninProWorkflowNode_crop',
  matteContiguous: 'roninProWorkflowNode_matteContiguous',
  matteGlobal: 'roninProWorkflowNode_matteGlobal',
  padExpand: 'roninProWorkflowNode_padExpand',
  evenSplitStrip: 'roninProWorkflowNode_evenSplitStrip',
  mergeStrip: 'roninProWorkflowNode_mergeStrip',
  gridDeleteRow: 'roninProWorkflowNode_gridDeleteRow',
  gridDeleteCol: 'roninProWorkflowNode_gridDeleteCol',
  gridExpandRow: 'roninProWorkflowNode_gridExpandRow',
  gridExpandCol: 'roninProWorkflowNode_gridExpandCol',
  gridFlipRow: 'roninProWorkflowNode_gridFlipRow',
  gridFlipCol: 'roninProWorkflowNode_gridFlipCol',
  gridCopyRow: 'roninProWorkflowNode_gridCopyRow',
  gridCopyCol: 'roninProWorkflowNode_gridCopyCol',
  customGridRearrange: 'roninProWorkflowNode_customGridRearrange',
}

/** 节点参数输入框：钳位到 [min,max]，非法则用 fallback */
function wfClampInt(
  v: number | string | null | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  if (v === null || v === undefined || v === '') return fallback
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

const INPUT_FULL: CSSProperties = { width: '100%' }

export default function RoninProCustomWorkflow() {
  const { t } = useLanguage()
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([])
  const [graphEdges, setGraphEdges] = useState<WorkflowEdge[]>([])
  const [fileItems, setFileItems] = useState<{ id: string; file: File }[]>([])
  const [results, setResults] = useState<{ name: string; url: string }[]>([])
  const [running, setRunning] = useState(false)
  /** 导出预设名：写入 JSON 的 presetName，并用于下载文件名 */
  const [presetName, setPresetName] = useState('')

  useEffect(() => {
    return () => {
      setResults((prev) => {
        prev.forEach((r) => URL.revokeObjectURL(r.url))
        return []
      })
    }
  }, [])

  const updateNodeParam = useCallback((id: string, key: string, value: number) => {
    setGraphNodes((list) =>
      list.map((n) => (n.id === id ? { ...n, params: { ...n.params, [key]: value } } : n))
    )
  }, [])

  const updateCustomRearrangeDimension = useCallback(
    (id: string, key: 'splitCols' | 'splitRows' | 'outRows' | 'outCols', value: number) => {
      setGraphNodes((list) =>
        list.map((n) => {
          if (n.id !== id) return n
          if (n.type !== 'customGridRearrange') {
            return { ...n, params: { ...n.params, [key]: value } }
          }
          const nextParams = { ...n.params, [key]: value }
          const sc = Math.max(1, Math.round(nextParams.splitCols ?? 2))
          const sr = Math.max(1, Math.round(nextParams.splitRows ?? 2))
          const or = Math.max(1, Math.round(nextParams.outRows ?? 2))
          const oc = Math.max(1, Math.round(nextParams.outCols ?? 2))
          return {
            ...n,
            params: nextParams,
            rearrangeGrid: resizeRearrangeGrid(n.rearrangeGrid, or, oc, sc, sr),
          }
        })
      )
    },
    []
  )

  const updateCustomRearrangeCell = useCallback(
    (id: string, row: number, col: number, value: number | null) => {
      setGraphNodes((list) =>
        list.map((n) => {
          if (n.id !== id || n.type !== 'customGridRearrange') return n
          const sc = Math.max(1, Math.round(n.params.splitCols ?? 2))
          const sr = Math.max(1, Math.round(n.params.splitRows ?? 2))
          const or = Math.max(1, Math.round(n.params.outRows ?? 2))
          const oc = Math.max(1, Math.round(n.params.outCols ?? 2))
          const maxIdx = sc * sr
          const base =
            n.rearrangeGrid ?? buildDefaultRearrangeGrid(or, oc, sc, sr)
          const grid = base.map((r) => [...r])
          let v = value === null || value === undefined ? 0 : Math.trunc(Number(value))
          if (!Number.isFinite(v)) v = 0
          const abs = Math.abs(v)
          const cell = abs === 0 || abs > maxIdx ? 0 : v
          if (grid[row]?.[col] !== undefined) {
            grid[row]![col] = cell
          }
          return { ...n, rearrangeGrid: grid }
        })
      )
    },
    []
  )

  /** 按行主序自动填入 1、2、3…（超出切块数填 0），与新建节点默认一致 */
  const fillRearrangeGridAutoSequence = useCallback((nodeId: string) => {
    setGraphNodes((list) =>
      list.map((n) => {
        if (n.id !== nodeId || n.type !== 'customGridRearrange') return n
        const sc = Math.max(1, Math.round(n.params.splitCols ?? 2))
        const sr = Math.max(1, Math.round(n.params.splitRows ?? 2))
        const or = Math.max(1, Math.round(n.params.outRows ?? 2))
        const oc = Math.max(1, Math.round(n.params.outCols ?? 2))
        return {
          ...n,
          rearrangeGrid: buildDefaultRearrangeGrid(or, oc, sc, sr),
        }
      })
    )
  }, [])

  const addNodeAt = useCallback((type: WorkflowNodeType, x?: number, y?: number) => {
    setGraphNodes((prev) => {
      let nx: number
      if (x != null) {
        nx = x
      } else if (prev.length) {
        const last = prev[prev.length - 1]!
        const lastW = getBlueprintNodeWidth(last)
        nx = Math.min(8192 - lastW - 28, last.x + lastW + 28)
      } else {
        nx = 220
      }
      const ny = y ?? (prev.length ? prev[prev.length - 1]!.y : 200)
      return [...prev, createGraphNode(type, nx, ny)]
    })
  }, [])

  const handleRunAll = async () => {
    if (graphNodes.length === 0) {
      message.warning(t('roninProWorkflowNoNodes'))
      return
    }
    if (fileItems.length === 0) {
      message.warning(t('roninProWorkflowNoFiles'))
      return
    }
    const orderResult = getExecutionOrder(graphNodes, graphEdges)
    if (!orderResult.ok) {
      message.warning(t(`roninProWorkflowGraphErr_${orderResult.reason}`))
      return
    }
    setRunning(true)
    setResults((prev) => {
      prev.forEach((r) => URL.revokeObjectURL(r.url))
      return []
    })
    const out: { name: string; url: string }[] = []
    try {
      for (const { file } of fileItems) {
        const blob = await runWorkflowOnBlob(file, orderResult.order)
        const url = URL.createObjectURL(blob)
        const base = file.name.replace(/\.[^.]+$/, '')
        out.push({ name: `${base}_workflow.png`, url })
      }
      setResults(out)
      message.success(t('roninProWorkflowDone'))
    } catch (e) {
      console.error(e)
      message.error(t('roninProWorkflowFailed'))
    } finally {
      setRunning(false)
    }
  }

  const saveJsonToFile = () => {
    try {
      const json = serializeWorkflowGraph(graphNodes, graphEdges, {
        presetName: presetName.trim() || undefined,
      })
      const blob = new Blob([json], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const base = sanitizeWorkflowPresetFileBase(presetName)
      a.download = `${base}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      try {
        localStorage.setItem(STORAGE_KEY, json)
        message.success(t('roninProWorkflowSavedLast'))
      } catch {
        /* ignore quota */
      }
    } catch {
      message.error(t('roninProWorkflowFailed'))
    }
  }

  const loadJsonFromStorage = () => {
    try {
      let raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) raw = localStorage.getItem('roninProCustomWorkflow.v2')
      if (!raw) raw = localStorage.getItem('roninProCustomWorkflow.v1')
      if (!raw) {
        message.warning(t('roninProWorkflowNoLast'))
        return
      }
      const { nodes, edges, presetName: loadedName } = parseWorkflowGraph(raw)
      setGraphNodes(nodes)
      setGraphEdges(edges)
      setPresetName(loadedName ?? '')
      message.success(t('roninProWorkflowLoadSuccess'))
    } catch {
      message.error(t('roninProWorkflowLoadFailed'))
    }
  }

  const onPickJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const { nodes, edges, presetName: loadedName } = parseWorkflowGraph(String(reader.result))
        setGraphNodes(nodes)
        setGraphEdges(edges)
        setPresetName(loadedName ?? '')
        try {
          localStorage.setItem(STORAGE_KEY, String(reader.result))
        } catch {
          /* ignore */
        }
        message.success(t('roninProWorkflowLoadSuccess'))
      } catch {
        message.error(t('roninProWorkflowLoadFailed'))
      }
    }
    reader.readAsText(f)
  }

  const renderNodeBody = useCallback(
    (n: GraphNode) => {
      const id = n.id
      const p = n.params
      switch (n.type) {
        case 'geminiWatermarkRemove':
          return <Text style={{ color: '#9aa3b5', fontSize: 12 }}>{t('roninProWorkflowNoParams')}</Text>
        case 'resize':
          return (
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              <div>
                <Text style={{ color: '#9aa3b5', fontSize: 11 }}>{t('roninProCustomScaleTargetW')}</Text>
                <InputNumber
                  min={8}
                  max={2048}
                  size="small"
                  style={INPUT_FULL}
                  value={Math.round(p.w ?? 256)}
                  onChange={(v) => updateNodeParam(id, 'w', wfClampInt(v, 8, 2048, 256))}
                />
              </div>
              <div>
                <Text style={{ color: '#9aa3b5', fontSize: 11 }}>{t('roninProCustomScaleTargetH')}</Text>
                <InputNumber
                  min={8}
                  max={2048}
                  size="small"
                  style={INPUT_FULL}
                  value={Math.round(p.h ?? 256)}
                  onChange={(v) => updateNodeParam(id, 'h', wfClampInt(v, 8, 2048, 256))}
                />
              </div>
              <Space size="small" wrap>
                <Checkbox
                  checked={(p.keepAspect ?? 1) !== 0}
                  onChange={(e) => updateNodeParam(id, 'keepAspect', e.target.checked ? 1 : 0)}
                  style={{ color: '#c8d0e0' }}
                >
                  {t('roninProCustomScaleKeepAspect')}
                </Checkbox>
                <Checkbox
                  checked={(p.pixelated ?? 1) !== 0}
                  onChange={(e) => updateNodeParam(id, 'pixelated', e.target.checked ? 1 : 0)}
                  style={{ color: '#c8d0e0' }}
                >
                  {t('roninProWorkflowPixelated')}
                </Checkbox>
              </Space>
            </Space>
          )
        case 'crop':
          return (
            <Row gutter={[6, 6]}>
              {(['left', 'top', 'right', 'bottom'] as const).map((k) => (
                <Col span={12} key={k}>
                  <Text style={{ color: '#9aa3b5', fontSize: 11 }}>
                    {t(`roninProWorkflowCrop_${k}`)}
                  </Text>
                  <InputNumber
                    min={0}
                    max={2048}
                    size="small"
                    style={{ width: '100%' }}
                    value={Math.round(p[k] ?? 0)}
                    onChange={(v) => updateNodeParam(id, k, Number(v) || 0)}
                  />
                </Col>
              ))}
            </Row>
          )
        case 'matteContiguous':
        case 'matteGlobal':
          return (
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              <div>
                <Text style={{ color: '#9aa3b5', fontSize: 11 }}>{t('roninProWorkflowTolerance')}</Text>
                <InputNumber
                  min={0}
                  max={150}
                  size="small"
                  style={INPUT_FULL}
                  value={Math.round(p.tolerance ?? 80)}
                  onChange={(v) => updateNodeParam(id, 'tolerance', wfClampInt(v, 0, 150, 80))}
                />
              </div>
              <div>
                <Text style={{ color: '#9aa3b5', fontSize: 11 }}>{t('roninProWorkflowFeather')}</Text>
                <InputNumber
                  min={0}
                  max={40}
                  size="small"
                  style={INPUT_FULL}
                  value={Math.round(p.feather ?? 5)}
                  onChange={(v) => updateNodeParam(id, 'feather', wfClampInt(v, 0, 40, 5))}
                />
              </div>
            </Space>
          )
        case 'padExpand':
          return (
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              {(
                [
                  ['padTop', 'roninProWorkflowPadTop'],
                  ['padRight', 'roninProWorkflowPadRight'],
                  ['padBottom', 'roninProWorkflowPadBottom'],
                  ['padLeft', 'roninProWorkflowPadLeft'],
                ] as const
              ).map(([key, tk]) => (
                <div key={key}>
                  <Text style={{ color: '#9aa3b5', fontSize: 11 }}>{t(tk)}</Text>
                  <InputNumber
                    min={0}
                    max={512}
                    size="small"
                    style={INPUT_FULL}
                    value={Math.round(p[key] ?? 0)}
                    onChange={(v) => updateNodeParam(id, key, wfClampInt(v, 0, 512, 0))}
                  />
                </div>
              ))}
            </Space>
          )
        case 'evenSplitStrip':
          return (
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              <div>
                <Text style={{ color: '#9aa3b5', fontSize: 11 }}>{t('roninProWorkflowEvenCols')}</Text>
                <InputNumber
                  min={1}
                  max={32}
                  size="small"
                  style={INPUT_FULL}
                  value={Math.round(p.evenCols ?? 4)}
                  onChange={(v) => updateNodeParam(id, 'evenCols', wfClampInt(v, 1, 32, 4))}
                />
              </div>
              <div>
                <Text style={{ color: '#9aa3b5', fontSize: 11 }}>{t('roninProWorkflowEvenRows')}</Text>
                <InputNumber
                  min={1}
                  max={32}
                  size="small"
                  style={INPUT_FULL}
                  value={Math.round(p.evenRows ?? 4)}
                  onChange={(v) => updateNodeParam(id, 'evenRows', wfClampInt(v, 1, 32, 4))}
                />
              </div>
            </Space>
          )
        case 'mergeStrip':
          return (
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              <div>
                <Text style={{ color: '#9aa3b5', fontSize: 11 }}>{t('roninProWorkflowMergeCols')}</Text>
                <InputNumber
                  min={1}
                  max={32}
                  size="small"
                  style={INPUT_FULL}
                  value={Math.round(p.mergeCols ?? 4)}
                  onChange={(v) => updateNodeParam(id, 'mergeCols', wfClampInt(v, 1, 32, 4))}
                />
              </div>
              <div>
                <Text style={{ color: '#9aa3b5', fontSize: 11 }}>{t('roninProWorkflowFrameCount')}</Text>
                <InputNumber
                  min={1}
                  max={4096}
                  size="small"
                  style={INPUT_FULL}
                  value={Math.round(p.frameCount ?? 16)}
                  onChange={(v) => updateNodeParam(id, 'frameCount', wfClampInt(v, 1, 4096, 16))}
                />
              </div>
            </Space>
          )
        case 'gridDeleteRow':
        case 'gridDeleteCol':
        case 'gridExpandRow':
        case 'gridExpandCol':
        case 'gridFlipRow':
        case 'gridFlipCol':
        case 'gridCopyRow':
        case 'gridCopyCol': {
          const gc = Math.max(1, Math.round(p.gCols ?? 4))
          const gr = Math.max(1, Math.round(p.gRows ?? 4))
          const gridCommon = (
            <>
              <div>
                <Text style={{ color: '#9aa3b5', fontSize: 11 }}>{t('roninProWorkflowGridCols')}</Text>
                <InputNumber
                  min={1}
                  max={32}
                  size="small"
                  style={INPUT_FULL}
                  value={gc}
                  onChange={(v) => updateNodeParam(id, 'gCols', wfClampInt(v, 1, 32, 4))}
                />
              </div>
              <div>
                <Text style={{ color: '#9aa3b5', fontSize: 11 }}>{t('roninProWorkflowGridRows')}</Text>
                <InputNumber
                  min={1}
                  max={32}
                  size="small"
                  style={INPUT_FULL}
                  value={gr}
                  onChange={(v) => updateNodeParam(id, 'gRows', wfClampInt(v, 1, 32, 4))}
                />
              </div>
              <Text style={{ color: '#7a8499', fontSize: 10 }}>{t('roninProWorkflowGridCellHint')}</Text>
            </>
          )
          if (n.type === 'gridDeleteRow') {
            return (
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                {gridCommon}
                <div>
                  <Text style={{ color: '#9aa3b5', fontSize: 11 }}>{t('roninProWorkflowRowIndex')}</Text>
                  <InputNumber
                    min={1}
                    max={gr}
                    size="small"
                    style={INPUT_FULL}
                    value={Math.round(p.rowIndex ?? 1)}
                    onChange={(v) => updateNodeParam(id, 'rowIndex', wfClampInt(v, 1, gr, 1))}
                  />
                </div>
              </Space>
            )
          }
          if (n.type === 'gridDeleteCol' || n.type === 'gridFlipCol') {
            return (
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                {gridCommon}
                <div>
                  <Text style={{ color: '#9aa3b5', fontSize: 11 }}>{t('roninProWorkflowColIndex')}</Text>
                  <InputNumber
                    min={1}
                    max={gc}
                    size="small"
                    style={INPUT_FULL}
                    value={Math.round(p.colIndex ?? 1)}
                    onChange={(v) => updateNodeParam(id, 'colIndex', wfClampInt(v, 1, gc, 1))}
                  />
                </div>
              </Space>
            )
          }
          if (n.type === 'gridCopyCol') {
            return (
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                {gridCommon}
                <div>
                  <Text style={{ color: '#9aa3b5', fontSize: 11 }}>{t('roninProWorkflowCopySourceCol')}</Text>
                  <InputNumber
                    min={1}
                    max={gc}
                    size="small"
                    style={INPUT_FULL}
                    value={Math.round(p.colIndex ?? 1)}
                    onChange={(v) => updateNodeParam(id, 'colIndex', wfClampInt(v, 1, gc, 1))}
                  />
                </div>
                <div>
                  <Text style={{ color: '#9aa3b5', fontSize: 11 }}>{t('roninProWorkflowCopyInsertBeforeCol')}</Text>
                  <InputNumber
                    min={1}
                    max={gc + 1}
                    size="small"
                    style={INPUT_FULL}
                    value={Math.round(p.atCol ?? 2)}
                    onChange={(v) => updateNodeParam(id, 'atCol', wfClampInt(v, 1, gc + 1, 2))}
                  />
                </div>
                <Text style={{ color: '#7a8499', fontSize: 10 }}>{t('roninProWorkflowGridCopyColHint')}</Text>
              </Space>
            )
          }
          if (n.type === 'gridExpandRow') {
            return (
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                {gridCommon}
                <div>
                  <Text style={{ color: '#9aa3b5', fontSize: 11 }}>{t('roninProWorkflowAtRow')}</Text>
                  <InputNumber
                    min={1}
                    max={gr + 1}
                    size="small"
                    style={INPUT_FULL}
                    value={Math.round(p.atRow ?? 1)}
                    onChange={(v) => updateNodeParam(id, 'atRow', wfClampInt(v, 1, gr + 1, 1))}
                  />
                </div>
                <Text style={{ color: '#7a8499', fontSize: 10 }}>{t('roninProWorkflowExpandBandAuto')}</Text>
              </Space>
            )
          }
          if (n.type === 'gridExpandCol') {
            return (
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                {gridCommon}
                <div>
                  <Text style={{ color: '#9aa3b5', fontSize: 11 }}>{t('roninProWorkflowAtCol')}</Text>
                  <InputNumber
                    min={1}
                    max={gc + 1}
                    size="small"
                    style={INPUT_FULL}
                    value={Math.round(p.atCol ?? 1)}
                    onChange={(v) => updateNodeParam(id, 'atCol', wfClampInt(v, 1, gc + 1, 1))}
                  />
                </div>
                <Text style={{ color: '#7a8499', fontSize: 10 }}>{t('roninProWorkflowExpandBandAuto')}</Text>
              </Space>
            )
          }
          if (n.type === 'gridFlipRow') {
            return (
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                {gridCommon}
                <div>
                  <Text style={{ color: '#9aa3b5', fontSize: 11 }}>{t('roninProWorkflowRowIndex')}</Text>
                  <InputNumber
                    min={1}
                    max={gr}
                    size="small"
                    style={INPUT_FULL}
                    value={Math.round(p.rowIndex ?? 1)}
                    onChange={(v) => updateNodeParam(id, 'rowIndex', wfClampInt(v, 1, gr, 1))}
                  />
                </div>
              </Space>
            )
          }
          if (n.type === 'gridCopyRow') {
            return (
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                {gridCommon}
                <div>
                  <Text style={{ color: '#9aa3b5', fontSize: 11 }}>{t('roninProWorkflowCopySourceRow')}</Text>
                  <InputNumber
                    min={1}
                    max={gr}
                    size="small"
                    style={INPUT_FULL}
                    value={Math.round(p.rowIndex ?? 1)}
                    onChange={(v) => updateNodeParam(id, 'rowIndex', wfClampInt(v, 1, gr, 1))}
                  />
                </div>
                <div>
                  <Text style={{ color: '#9aa3b5', fontSize: 11 }}>{t('roninProWorkflowCopyInsertBeforeRow')}</Text>
                  <InputNumber
                    min={1}
                    max={gr + 1}
                    size="small"
                    style={INPUT_FULL}
                    value={Math.round(p.atRow ?? 2)}
                    onChange={(v) => updateNodeParam(id, 'atRow', wfClampInt(v, 1, gr + 1, 2))}
                  />
                </div>
                <Text style={{ color: '#7a8499', fontSize: 10 }}>{t('roninProWorkflowGridCopyRowHint')}</Text>
              </Space>
            )
          }
          return null
        }
        case 'customGridRearrange': {
          const sc = Math.max(1, Math.round(p.splitCols ?? 2))
          const sr = Math.max(1, Math.round(p.splitRows ?? 2))
          const or = Math.max(1, Math.round(p.outRows ?? 2))
          const oc = Math.max(1, Math.round(p.outCols ?? 2))
          const maxIdx = sc * sr
          const cellInputW = getCustomRearrangeInputWidth(n)
          const grid =
            n.rearrangeGrid ?? buildDefaultRearrangeGrid(or, oc, sc, sr)
          return (
            <Space direction="vertical" style={{ width: '100%', minWidth: 0 }} size="small">
              <div>
                <Text style={{ color: '#9aa3b5', fontSize: 11 }}>
                  {t('roninProWorkflowRearrangeSplitCols')}
                </Text>
                <InputNumber
                  min={1}
                  max={32}
                  size="small"
                  style={INPUT_FULL}
                  value={sc}
                  onChange={(v) =>
                    updateCustomRearrangeDimension(id, 'splitCols', wfClampInt(v, 1, 32, 2))
                  }
                />
              </div>
              <div>
                <Text style={{ color: '#9aa3b5', fontSize: 11 }}>
                  {t('roninProWorkflowRearrangeSplitRows')}
                </Text>
                <InputNumber
                  min={1}
                  max={32}
                  size="small"
                  style={INPUT_FULL}
                  value={sr}
                  onChange={(v) =>
                    updateCustomRearrangeDimension(id, 'splitRows', wfClampInt(v, 1, 32, 2))
                  }
                />
              </div>
              <div>
                <Text style={{ color: '#9aa3b5', fontSize: 11 }}>
                  {t('roninProWorkflowRearrangeOutRows')}
                </Text>
                <InputNumber
                  min={1}
                  max={64}
                  size="small"
                  style={INPUT_FULL}
                  value={or}
                  onChange={(v) =>
                    updateCustomRearrangeDimension(id, 'outRows', wfClampInt(v, 1, 64, 2))
                  }
                />
              </div>
              <div>
                <Text style={{ color: '#9aa3b5', fontSize: 11 }}>
                  {t('roninProWorkflowRearrangeOutCols')}
                </Text>
                <InputNumber
                  min={1}
                  max={64}
                  size="small"
                  style={INPUT_FULL}
                  value={oc}
                  onChange={(v) =>
                    updateCustomRearrangeDimension(id, 'outCols', wfClampInt(v, 1, 64, 2))
                  }
                />
              </div>
              <Text style={{ color: '#7a8499', fontSize: 10 }}>{t('roninProWorkflowRearrangeGridHint')}</Text>
              <Button
                type="default"
                size="small"
                block
                icon={<OrderedListOutlined />}
                onClick={() => fillRearrangeGridAutoSequence(id)}
                style={{ marginTop: 2 }}
              >
                {t('roninProWorkflowRearrangeAutoFill')}
              </Button>
              <div style={{ width: '100%', minWidth: 0 }}>
                <table
                  style={{
                    borderCollapse: 'collapse',
                    fontSize: 11,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    width: '100%',
                    tableLayout: 'fixed',
                  }}
                >
                  <colgroup>
                    {Array.from({ length: oc }, (_, col) => (
                      <col key={col} style={{ width: `${100 / oc}%` }} />
                    ))}
                  </colgroup>
                  <tbody>
                    {grid.map((rowData, row) => (
                      <tr key={row}>
                        {rowData.map((val, col) => (
                          <td
                            key={col}
                            style={{
                              border: '1px solid rgba(255,255,255,0.12)',
                              padding: 3,
                              verticalAlign: 'middle',
                              boxSizing: 'border-box',
                            }}
                          >
                            <InputNumber
                              size="small"
                              controls={false}
                              min={-maxIdx}
                              max={maxIdx}
                              value={val}
                              onChange={(v) => updateCustomRearrangeCell(id, row, col, v ?? 0)}
                              style={{
                                width: '100%',
                                minWidth: cellInputW,
                                maxWidth: '100%',
                              }}
                              className="ronin-blueprint-rearrange-cell"
                              placeholder="0"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Space>
          )
        }
        default:
          return null
      }
    },
    [t, updateNodeParam, updateCustomRearrangeDimension, updateCustomRearrangeCell, fillRearrangeGridAutoSequence]
  )

  return (
    <Fragment>
    <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: '100%' }}>
      <Text type="secondary">{t('roninProCustomWorkflowHint')}</Text>

      <WorkflowBlueprintCanvas
        nodes={graphNodes}
        edges={graphEdges}
        setNodes={setGraphNodes}
        setEdges={setGraphEdges}
        getNodeTitle={(n) => t(NODE_LABEL_I18N[n.type])}
        renderNodeBody={renderNodeBody}
        tHint={t}
        onPaletteDrop={(type, x, y) => addNodeAt(type, x, y)}
      />

      <div>
        <Text strong>{t('roninProWorkflowIoTitle')}</Text>
        <div style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 12, color: '#9aa3b5' }}>{t('roninProWorkflowPresetName')}</Text>
          <Input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder={t('roninProWorkflowPresetNamePlaceholder')}
            maxLength={120}
            allowClear
            style={{ marginTop: 4, maxWidth: 400 }}
          />
        </div>
        <Space wrap style={{ marginTop: 8 }}>
          <Button onClick={saveJsonToFile}>{t('roninProWorkflowSaveJson')}</Button>
          <Button
            onClick={() => document.getElementById('ronin-workflow-json-input')?.click()}
          >
            {t('roninProWorkflowLoadJson')}
          </Button>
          <input
            id="ronin-workflow-json-input"
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={onPickJsonFile}
          />
          <Button onClick={loadJsonFromStorage}>{t('roninProWorkflowLoadLast')}</Button>
        </Space>
      </div>

      <div>
        <Text strong>{t('roninProWorkflowImages')}</Text>
        <Dragger
          multiple
          accept={IMAGE_ACCEPT.join(',')}
          showUploadList
          fileList={fileItems.map(({ id, file }) => ({
            uid: id,
            name: file.name,
            status: 'done' as const,
          }))}
          beforeUpload={(file) => {
            const id =
              typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `f-${Date.now()}-${Math.random()}`
            setFileItems((prev) => [...prev, { id, file }])
            return false
          }}
          onRemove={(file) => {
            setFileItems((prev) => prev.filter((x) => x.id !== file.uid))
          }}
        >
          <p className="ant-upload-drag-icon">
            <ExpandOutlined />
          </p>
          <p className="ant-upload-text">{t('roninProWorkflowUploadHint')}</p>
        </Dragger>
      </div>

      <Button type="primary" loading={running} onClick={handleRunAll} block>
        {t('roninProWorkflowRunAll')}
      </Button>

      {results.length > 0 && (
        <div>
          <Text strong>{t('roninProWorkflowResults')}</Text>
          <Row gutter={[16, 16]} style={{ marginTop: 12 }}>
            {results.map((r) => (
              <Col xs={24} sm={12} key={r.url}>
                <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 8 }}>
                  <img
                    src={r.url}
                    alt=""
                    style={{
                      maxWidth: '100%',
                      maxHeight: 200,
                      objectFit: 'contain',
                      display: 'block',
                      margin: '0 auto',
                    }}
                  />
                  <Button
                    type="link"
                    block
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      const a = document.createElement('a')
                      a.href = r.url
                      a.download = r.name
                      a.click()
                    }}
                  >
                    {t('roninProWorkflowDownload')}
                  </Button>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      )}
    </Space>

    <aside style={PALETTE_FLOAT_OUTER} aria-label={t('roninProWorkflowPalette')}>
      <Text strong style={{ fontSize: 13, display: 'block', flexShrink: 0 }}>
        {t('roninProWorkflowPalette')}
      </Text>
      <div style={PALETTE_FLOAT_SCROLL}>
        {WORKFLOW_PALETTE.map((item) => (
          <Button
            key={item.type}
            size="small"
            block
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/workflow-node-type', item.type)
              e.dataTransfer.effectAllowed = 'copy'
            }}
            onClick={() => addNodeAt(item.type)}
            style={{
              textAlign: 'left',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
              maxWidth: '100%',
            }}
          >
            {t(NODE_LABEL_I18N[item.type])}
          </Button>
        ))}
      </div>
    </aside>
    </Fragment>
  )
}
