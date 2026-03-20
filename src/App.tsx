import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  Calculator, 
  Settings, 
  FileSpreadsheet, 
  Info, 
  Plus, 
  Trash2, 
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Stethoscope,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { HealthProcedure, AppConfig, SurgicalProcedure } from './types';
import { 
  searchProcedures, 
  saveProcedures, 
  getAllProcedures 
} from './services/db';
import { 
  calculateCOP, 
  formatUVB, 
  roundToNearestHundred,
  calculateISSSurgical
} from './utils/calculations';
import { cn } from './utils/cn';

const DEFAULT_CONFIG: AppConfig = {
  uvbValue: 12110,
  uvrValue: 1270, // Standard UVR value for ISS 2001
  issMultiplier: 1.4 // ISS + 40%
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'surgical' | 'iss' | 'config' | 'news'>('search');
  const [config, setConfig] = useState<AppConfig>(() => {
    const saved = localStorage.getItem('health_app_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_CONFIG, ...parsed };
      } catch (e) {
        return DEFAULT_CONFIG;
      }
    }
    return DEFAULT_CONFIG;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HealthProcedure[]>([]);
  const [selectedProcedure, setSelectedProcedure] = useState<HealthProcedure | null>(null);
  const [surgicalList, setSurgicalList] = useState<SurgicalProcedure[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    localStorage.setItem('health_app_config', JSON.stringify(config));
  }, [config]);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.length > 2) {
      const results = await searchProcedures(query);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus(null);

    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<HealthProcedure>(ws);
        
        // Basic validation of columns
        const requiredFields = ['Codigo_CUPS', 'Descripcion', 'Tarifa_UVB'];
        const firstRow = data[0] as any;
        const missing = requiredFields.filter(f => !(f in firstRow));
        
        if (missing.length > 0) {
          setUploadStatus({ 
            type: 'error', 
            message: `Faltan columnas requeridas: ${missing.join(', ')}` 
          });
          return;
        }

        await saveProcedures(data);
        setUploadStatus({ 
          type: 'success', 
          message: `Se cargaron ${data.length} procedimientos correctamente.` 
        });
      };
      reader.readAsBinaryString(file);
    } catch (error) {
      setUploadStatus({ 
        type: 'error', 
        message: 'Error al procesar el archivo Excel.' 
      });
    } finally {
      setIsUploading(false);
    }
  };

  const downloadTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Plantilla Homologador');

    // Define columns with widths
    worksheet.columns = [
      { header: 'Codigo_CUPS', key: 'Codigo_CUPS', width: 15 },
      { header: 'Descripcion', key: 'Descripcion', width: 45 },
      { header: 'Tarifa_UVB', key: 'Tarifa_UVB', width: 15 },
      { header: 'Grupo_Quirurgico', key: 'Grupo_Quirurgico', width: 18 },
      { header: 'Codigo_SOAT', key: 'Codigo_SOAT', width: 15 },
      { header: 'Codigo_ISS', key: 'Codigo_ISS', width: 15 },
      { header: 'UVR', key: 'UVR', width: 10 }
    ];

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF10B981' } // Emerald-500
      };
      cell.font = {
        bold: true,
        color: { argb: 'FFFFFFFF' },
        size: 11
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FF059669' } }
      };
    });
    headerRow.height = 25;

    // Add sample data
    const sampleData = [
      {
        Codigo_CUPS: '890201',
        Descripcion: 'CONSULTA DE PRIMERA VEZ POR MEDICINA GENERAL',
        Tarifa_UVB: 2.44,
        Grupo_Quirurgico: '',
        Codigo_SOAT: '39141',
        Codigo_ISS: 'S11101',
        UVR: 0
      },
      {
        Codigo_CUPS: '541101',
        Descripcion: 'LAPAROTOMIA EXPLORADORA',
        Tarifa_UVB: 15.2,
        Grupo_Quirurgico: '08',
        Codigo_SOAT: 'S12101',
        Codigo_ISS: 'I12101',
        UVR: 125
      }
    ];

    sampleData.forEach(item => {
      const row = worksheet.addRow(item);
      row.alignment = { vertical: 'middle' };
    });

    // Add some instructions/notes at the bottom
    worksheet.addRow([]);
    const noteRow = worksheet.addRow(['NOTA: Los campos Codigo_CUPS, Descripcion y Tarifa_UVB son obligatorios.']);
    noteRow.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' }, size: 9 };

    // Generate and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'Plantilla_Homologador.xlsx';
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  const addToSurgical = (proc: HealthProcedure) => {
    const newItem: SurgicalProcedure = {
      id: Math.random().toString(36).substr(2, 9),
      procedure: proc,
      isMain: surgicalList.length === 0,
      route: 'same'
    };
    setSurgicalList([...surgicalList, newItem]);
    setActiveTab('surgical');
  };

  const removeFromSurgical = (id: string) => {
    setSurgicalList(surgicalList.filter(p => p.id !== id));
  };

  const calculateSurgicalTotal = () => {
    if (surgicalList.length === 0) return 0;
    
    // Sort to ensure main is first (though we handle it by flag)
    let total = 0;
    const sorted = [...surgicalList].sort((a, b) => {
      if (a.isMain) return -1;
      if (b.isMain) return 1;
      return b.procedure.Tarifa_UVB - a.procedure.Tarifa_UVB;
    });

    sorted.forEach((item, index) => {
      const baseValue = item.procedure.Tarifa_UVB * config.uvbValue;
      if (index === 0) {
        total += baseValue; // 100%
      } else {
        const multiplier = item.route === 'same' ? 0.5 : 0.75;
        total += baseValue * multiplier;
      }
    });

    return roundToNearestHundred(total);
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
              <Stethoscope size={24} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Homologador</h1>
              <p className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold">Salud Colombia</p>
            </div>
          </div>
          
          <nav className="hidden md:flex items-center gap-1">
            <TabButton active={activeTab === 'search'} onClick={() => setActiveTab('search')} icon={<Search size={18} />} label="Consulta" />
            <TabButton active={activeTab === 'surgical'} onClick={() => setActiveTab('surgical')} icon={<Calculator size={18} />} label="Quirúrgico" />
            <TabButton active={activeTab === 'iss'} onClick={() => setActiveTab('iss')} icon={<Calculator size={18} />} label="ISS (UVR)" />
            <TabButton active={activeTab === 'news'} onClick={() => setActiveTab('news')} icon={<Info size={18} />} label="Novedades" />
            <TabButton active={activeTab === 'config'} onClick={() => setActiveTab('config')} icon={<Settings size={18} />} label="Configuración" />
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'search' && (
            <motion.div 
              key="search"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="relative max-w-2xl mx-auto">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
                <input 
                  type="text"
                  placeholder="Buscar por CUPS, SOAT o descripción..."
                  className="w-full pl-12 pr-4 py-4 bg-white border border-zinc-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-lg"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-4">
                  {searchResults.length > 0 ? (
                    searchResults.map((proc) => (
                      <ProcedureCard 
                        key={proc.Codigo_CUPS} 
                        proc={proc} 
                        config={config}
                        onSelect={() => setSelectedProcedure(proc)}
                        onAddSurgical={() => addToSurgical(proc)}
                      />
                    ))
                  ) : searchQuery.length > 2 ? (
                    <div className="text-center py-12 bg-white rounded-3xl border border-zinc-100">
                      <p className="text-zinc-400">No se encontraron resultados para "{searchQuery}"</p>
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-white rounded-3xl border border-zinc-100">
                      <Search className="mx-auto text-zinc-200 mb-4" size={48} />
                      <p className="text-zinc-400">Ingresa al menos 3 caracteres para buscar</p>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-1">
                  <div className="sticky top-24 space-y-6">
                    {selectedProcedure ? (
                      <DetailPanel 
                        proc={selectedProcedure} 
                        config={config} 
                        onClose={() => setSelectedProcedure(null)}
                      />
                    ) : (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 text-emerald-800">
                        <h3 className="font-bold mb-2 flex items-center gap-2">
                          <Info size={18} />
                          Información
                        </h3>
                        <p className="text-sm opacity-80 leading-relaxed">
                          Selecciona un procedimiento para ver el detalle de liquidación SOAT, UVB y equivalencias ISS 2001.
                        </p>
                        <div className="mt-4 pt-4 border-t border-emerald-200/50 text-xs flex justify-between">
                          <span>UVB Actual:</span>
                          <span className="font-bold">${(config.uvbValue || 0).toLocaleString()} COP</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'surgical' && (
            <motion.div 
              key="surgical"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-4xl mx-auto space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight">Liquidación Cirugías Múltiples</h2>
                <button 
                  onClick={() => setSurgicalList([])}
                  className="text-zinc-400 hover:text-red-500 transition-colors flex items-center gap-1 text-sm font-medium"
                >
                  <Trash2 size={16} />
                  Limpiar lista
                </button>
              </div>

              {surgicalList.length > 0 ? (
                <div className="space-y-4">
                  {surgicalList.map((item, index) => (
                    <div key={item.id} className="bg-white border border-zinc-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                            index === 0 ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                          )}>
                            {index === 0 ? "Principal (100%)" : `Adicional #${index}`}
                          </span>
                          <span className="text-xs font-mono text-zinc-400">{item.procedure.Codigo_CUPS}</span>
                        </div>
                        <h4 className="font-medium text-zinc-800 line-clamp-1">{item.procedure.Descripcion}</h4>
                      </div>

                      <div className="flex items-center gap-4">
                        {index > 0 && (
                          <select 
                            value={item.route}
                            onChange={(e) => {
                              const newList = [...surgicalList];
                              newList[index].route = e.target.value as any;
                              setSurgicalList(newList);
                            }}
                            className="bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="same">Misma Vía (50%)</option>
                            <option value="different">Diferente Vía (75%)</option>
                          </select>
                        )}
                        <div className="text-right min-w-[120px]">
                          <p className="text-xs text-zinc-400 font-mono">{formatUVB(item.procedure.Tarifa_UVB)} UVB</p>
                          <p className="font-bold text-emerald-600">
                            ${(item.procedure.Tarifa_UVB * config.uvbValue * (index === 0 ? 1 : (item.route === 'same' ? 0.5 : 0.75))).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </p>
                        </div>
                        <button 
                          onClick={() => removeFromSurgical(item.id)}
                          className="p-2 text-zinc-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="mt-8 bg-zinc-900 text-white rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl shadow-zinc-200">
                    <div>
                      <p className="text-zinc-400 text-sm uppercase tracking-widest font-bold mb-1">Total Liquidado (Redondeado)</p>
                      <h3 className="text-4xl font-bold tracking-tighter">${calculateSurgicalTotal().toLocaleString()} <span className="text-lg font-normal text-zinc-500">COP</span></h3>
                    </div>
                    <div className="flex gap-4">
                      <button 
                        onClick={() => window.print()}
                        className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold transition-colors"
                      >
                        Imprimir Cotización
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-zinc-200">
                  <Calculator className="mx-auto text-zinc-200 mb-4" size={64} />
                  <h3 className="text-xl font-bold text-zinc-400">Calculadora Vacía</h3>
                  <p className="text-zinc-400 max-w-xs mx-auto mt-2">Busca procedimientos en la pestaña de consulta y agrégalos para liquidar cirugías múltiples.</p>
                  <button 
                    onClick={() => setActiveTab('search')}
                    className="mt-6 px-6 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors"
                  >
                    Ir a Consulta
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'iss' && (
            <motion.div 
              key="iss"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="bg-white border border-zinc-200 rounded-3xl p-8 shadow-sm">
                <div className="flex items-center gap-4 mb-8">
                  <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
                    <Activity size={28} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">Liquidación ISS (UVR)</h2>
                    <p className="text-zinc-500 text-sm">Cálculo detallado de honorarios y derechos de sala basados en UVR.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="bg-zinc-50 p-6 rounded-2xl border border-zinc-100">
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Valor UVR Base</p>
                    <p className="text-2xl font-bold text-zinc-900">${(config.uvrValue || 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-zinc-50 p-6 rounded-2xl border border-zinc-100">
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Multiplicador ISS</p>
                    <p className="text-2xl font-bold text-blue-600">x{config.issMultiplier.toFixed(2)} <span className="text-sm font-normal text-zinc-400">(+{( (config.issMultiplier - 1) * 100 ).toFixed(0)}%)</span></p>
                  </div>
                  <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                    <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-2">UVR Liquidada</p>
                    <p className="text-2xl font-bold text-emerald-700">${((config.uvrValue || 0) * (config.issMultiplier || 1)).toLocaleString()}</p>
                  </div>
                </div>

                <div className="relative mb-8">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
                  <input 
                    type="text"
                    placeholder="Busca por CUPS, SOAT o descripción para liquidar ISS..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium transition-all"
                  />
                </div>

                {searchResults.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {searchResults.map(proc => (
                      <div 
                        key={proc.id}
                        onClick={() => setSelectedProcedure(proc)}
                        className={cn(
                          "p-6 rounded-2xl border transition-all cursor-pointer",
                          selectedProcedure?.id === proc.id 
                            ? "border-blue-500 bg-blue-50/30 ring-1 ring-blue-500" 
                            : "border-zinc-100 bg-white hover:border-zinc-300"
                        )}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-bold bg-zinc-100 px-2 py-1 rounded-md text-zinc-500 uppercase tracking-wider">
                            {proc.Codigo_CUPS}
                          </span>
                          {proc.UVR && (
                            <span className="text-[10px] font-bold bg-blue-100 px-2 py-1 rounded-md text-blue-600 uppercase tracking-wider">
                              {proc.UVR} UVR
                            </span>
                          )}
                        </div>
                        <h4 className="font-bold text-zinc-900 line-clamp-2 leading-tight">{proc.Descripcion}</h4>
                        <p className="text-xs text-zinc-400 mt-2">ISS: {proc.Codigo_ISS || 'N/A'}</p>
                      </div>
                    ))}
                  </div>
                ) : searchQuery && (
                  <div className="text-center py-12 bg-zinc-50 rounded-3xl border border-dashed border-zinc-200">
                    <p className="text-zinc-400 font-medium">No se encontraron procedimientos con los criterios de búsqueda.</p>
                  </div>
                )}
              </div>

              {selectedProcedure && selectedProcedure.UVR && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white border border-zinc-200 rounded-3xl overflow-hidden shadow-lg"
                >
                  <div className="bg-zinc-900 p-8 text-white">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-1">Resultado de Liquidación ISS</p>
                        <h3 className="text-2xl font-bold tracking-tight">{selectedProcedure.Descripcion}</h3>
                      </div>
                      <div className="text-right">
                        <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-1">UVR</p>
                        <p className="text-3xl font-bold text-blue-400">{selectedProcedure.UVR}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100 pb-2">Desglose de Honorarios</h4>
                        {(() => {
                          const breakdown = calculateISSSurgical(selectedProcedure.UVR!, config.uvrValue, config.issMultiplier);
                          return (
                            <div className="space-y-3">
                              <div className="flex justify-between items-center p-3 bg-zinc-50 rounded-xl">
                                <span className="text-sm font-medium text-zinc-600">Cirujano</span>
                                <span className="font-bold text-zinc-900">${breakdown.surgeon.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center p-3 bg-zinc-50 rounded-xl">
                                <span className="text-sm font-medium text-zinc-600">Anestesiólogo</span>
                                <span className="font-bold text-zinc-900">${breakdown.anesthesiologist.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center p-3 bg-zinc-50 rounded-xl">
                                <span className="text-sm font-medium text-zinc-600">Ayudantía</span>
                                <span className="font-bold text-zinc-900">${breakdown.assistant.toLocaleString()}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100 pb-2">Derechos y Materiales</h4>
                        {(() => {
                          const breakdown = calculateISSSurgical(selectedProcedure.UVR!, config.uvrValue, config.issMultiplier);
                          return (
                            <div className="space-y-3">
                              <div className="flex justify-between items-center p-3 bg-zinc-50 rounded-xl">
                                <span className="text-sm font-medium text-zinc-600">Derechos de Sala</span>
                                <span className="font-bold text-zinc-900">${breakdown.room.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center p-3 bg-zinc-50 rounded-xl">
                                <span className="text-sm font-medium text-zinc-600">Materiales</span>
                                <span className="font-bold text-zinc-900">${breakdown.materials.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                                <span className="text-sm font-bold text-emerald-700">TOTAL LIQUIDADO</span>
                                <span className="text-xl font-black text-emerald-800">${breakdown.total.toLocaleString()}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="mt-8 p-4 bg-blue-50 rounded-2xl border border-blue-100 flex gap-4 items-start">
                      <AlertCircle className="text-blue-600 shrink-0" size={20} />
                      <p className="text-xs text-blue-800 leading-relaxed">
                        Esta liquidación se basa en el Manual Tarifario ISS 2001 (Acuerdo 256 de 2001) utilizando el valor de UVR parametrizado en la configuración. 
                        Los valores incluyen el incremento del {((config.issMultiplier - 1) * 100).toFixed(0)}% definido globalmente.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {selectedProcedure && !selectedProcedure.UVR && (
                <div className="p-8 bg-amber-50 border border-amber-200 rounded-3xl flex gap-4 items-center">
                  <AlertCircle className="text-amber-600" size={24} />
                  <div>
                    <p className="font-bold text-amber-900">Procedimiento sin UVR</p>
                    <p className="text-sm text-amber-700">Este procedimiento no tiene asignada una Unidad de Valor Relativo (UVR) en la base de datos, por lo que no puede liquidarse por el módulo ISS.</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'config' && (
            <motion.div 
              key="config"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <section className="bg-white border border-zinc-200 rounded-3xl p-8 shadow-sm">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <Settings size={22} className="text-emerald-600" />
                  Configuración Global
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Valor UVB</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">$</span>
                      <input 
                        type="number"
                        value={config.uvbValue}
                        onChange={(e) => setConfig({ ...config, uvbValue: Number(e.target.value) })}
                        className="w-full pl-8 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                      />
                    </div>
                    <p className="text-[10px] text-zinc-400 italic">Referencia: Circular Externa 047 de 2025</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Valor UVR (ISS 2001)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">$</span>
                      <input 
                        type="number"
                        value={config.uvrValue}
                        onChange={(e) => setConfig({ ...config, uvrValue: Number(e.target.value) })}
                        className="w-full pl-8 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                      />
                    </div>
                    <p className="text-[10px] text-zinc-400 italic">Valor base por unidad UVR</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Multiplicador ISS 2001</label>
                    <div className="relative">
                      <input 
                        type="number"
                        step="0.05"
                        min="1"
                        max="2"
                        value={config.issMultiplier}
                        onChange={(e) => setConfig({ ...config, issMultiplier: Number(e.target.value) })}
                        className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">Ej: 1.4 = +40%</span>
                    </div>
                    <p className="text-[10px] text-zinc-400 italic">Rango permitido: 1.0 a 2.0 (Máx +100%)</p>
                  </div>
                </div>
              </section>

              <section className="bg-white border border-zinc-200 rounded-3xl p-8 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <FileSpreadsheet size={22} className="text-emerald-600" />
                    Carga Masiva de Datos
                  </h3>
                  <button 
                    onClick={downloadTemplate}
                    className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition-colors"
                  >
                    <FileSpreadsheet size={16} />
                    Descargar Plantilla Excel
                  </button>
                </div>
                
                <div className="border-2 border-dashed border-zinc-200 rounded-2xl p-8 text-center hover:border-emerald-400 transition-colors relative group">
                  <input 
                    type="file" 
                    accept=".xlsx, .xls"
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    disabled={isUploading}
                  />
                  <div className="space-y-4">
                    <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto group-hover:bg-emerald-50 transition-colors">
                      <FileSpreadsheet size={32} className="text-zinc-300 group-hover:text-emerald-500 transition-colors" />
                    </div>
                    <div>
                      <p className="font-bold text-zinc-700">Haz clic o arrastra tu archivo Excel</p>
                      <p className="text-sm text-zinc-400 mt-1">Formatos soportados: .xlsx, .xls</p>
                    </div>
                  </div>
                </div>

                {uploadStatus && (
                  <div className={cn(
                    "mt-6 p-4 rounded-xl flex items-center gap-3",
                    uploadStatus.type === 'success' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"
                  )}>
                    {uploadStatus.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                    <p className="text-sm font-medium">{uploadStatus.message}</p>
                  </div>
                )}

                <div className="mt-8 space-y-4">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Estructura Requerida</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {['Codigo_CUPS', 'Descripcion', 'Tarifa_UVB', 'Grupo_Quirurgico', 'Codigo_SOAT', 'Codigo_ISS', 'UVR'].map(field => (
                      <div key={field} className="bg-zinc-50 px-3 py-2 rounded-lg text-[10px] font-mono text-zinc-500 border border-zinc-100">
                        {field}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'news' && (
            <motion.div 
              key="news"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-3xl mx-auto space-y-8"
            >
              <div className="bg-white border border-zinc-200 rounded-3xl p-8 shadow-sm">
                <h2 className="text-2xl font-bold mb-6">Novedades CUPS</h2>
                <p className="text-zinc-500 mb-8 leading-relaxed">
                  Resumen de los cambios más significativos introducidos por la Resolución 2706 de 2025.
                </p>

                <div className="space-y-6">
                  <NewsItem 
                    title="Actualización de UVB" 
                    date="Enero"
                    content="Se establece el valor de la UVB en $12.110 COP, impactando todas las tarifas liquidadas bajo el manual SOAT."
                    tag="Normativo"
                  />
                  <NewsItem 
                    title="Nuevos Códigos Desagregados" 
                    date="Enero"
                    content="Varios procedimientos de radiología e intervencionismo han sido desagregados para mayor precisión en la facturación."
                    tag="CUPS"
                  />
                  <NewsItem 
                    title="Regla de Redondeo" 
                    date="Recordatorio"
                    content="Se mantiene la obligatoriedad de redondear a la centena más cercana para todos los valores liquidados en pesos."
                    tag="Liquidación"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="mt-20 border-t border-zinc-200 bg-white py-12">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Homologador de Tarifas</p>
            <p className="text-xs text-zinc-400 mt-1">Basado en Res. 2706/2025 y Circ. 047/2025</p>
          </div>
          <div className="flex gap-8">
            <FooterLink label="CUPS" href="#" />
            <FooterLink label="SOAT" href="#" />
            <FooterLink label="ISS 2001" href="#" />
          </div>
        </div>
      </footer>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-medium text-sm",
        active ? "bg-emerald-50 text-emerald-700" : "text-zinc-500 hover:bg-zinc-50"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

interface ProcedureCardProps {
  proc: HealthProcedure;
  config: AppConfig;
  onSelect: () => void;
  onAddSurgical: () => void;
}

const ProcedureCard: React.FC<ProcedureCardProps> = ({ proc, config, onSelect, onAddSurgical }) => {
  const copValue = calculateCOP(proc.Tarifa_UVB, config.uvbValue);
  
  return (
    <div className="group bg-white border border-zinc-200 rounded-2xl p-5 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer relative overflow-hidden">
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1" onClick={onSelect}>
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-zinc-100 text-zinc-500 text-[10px] font-mono px-2 py-0.5 rounded uppercase tracking-wider font-bold">CUPS: {proc.Codigo_CUPS}</span>
            {proc.Codigo_SOAT && <span className="bg-blue-50 text-blue-600 text-[10px] font-mono px-2 py-0.5 rounded uppercase tracking-wider font-bold">SOAT: {proc.Codigo_SOAT}</span>}
          </div>
          <h3 className="font-bold text-zinc-800 leading-snug group-hover:text-emerald-700 transition-colors">{proc.Descripcion}</h3>
          <p className="text-xs text-zinc-400 mt-2 line-clamp-1">{proc.Capitulo}</p>
        </div>
        
        <div className="text-right">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Tarifa SOAT</p>
          <p className="text-xl font-bold text-zinc-900 tracking-tighter">${(copValue || 0).toLocaleString()}</p>
          <p className="text-xs text-zinc-400 font-mono">{formatUVB(proc.Tarifa_UVB)} UVB</p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-zinc-50 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          className="text-xs font-bold text-emerald-600 flex items-center gap-1"
        >
          Ver detalles <ChevronRight size={14} />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onAddSurgical(); }}
          className="bg-emerald-600 text-white p-2 rounded-lg hover:bg-emerald-700 transition-colors"
          title="Agregar a liquidación quirúrgica"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

interface DetailPanelProps {
  proc: HealthProcedure;
  config: AppConfig;
  onClose: () => void;
}

const DetailPanel: React.FC<DetailPanelProps> = ({ proc, config, onClose }) => {
  const copValue = calculateCOP(proc.Tarifa_UVB, config.uvbValue);
  const issValue = calculateCOP(proc.Tarifa_UVB, config.uvbValue) * config.issMultiplier;
  
  return (
    <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-lg space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex justify-between items-start">
        <h3 className="font-bold text-lg text-zinc-800">Detalle de Liquidación</h3>
        <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600">
          <Trash2 size={18} />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Procedimiento</label>
          <p className="text-sm font-medium text-zinc-700 leading-relaxed">{proc.Descripcion}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-zinc-50 p-3 rounded-xl">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Código CUPS</label>
            <p className="font-mono font-bold text-zinc-800">{proc.Codigo_CUPS}</p>
          </div>
          <div className="bg-zinc-50 p-3 rounded-xl">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Código SOAT</label>
            <p className="font-mono font-bold text-zinc-800">{proc.Codigo_SOAT || 'N/A'}</p>
          </div>
        </div>

        <div className="p-4 bg-emerald-600 text-white rounded-2xl shadow-md shadow-emerald-100">
          <label className="text-[10px] font-bold opacity-70 uppercase tracking-widest block mb-1">Liquidación SOAT</label>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tighter">${(copValue || 0).toLocaleString()}</span>
            <span className="text-xs opacity-80">COP</span>
          </div>
          <p className="text-[10px] mt-2 font-mono opacity-80">Cálculo: {formatUVB(proc.Tarifa_UVB)} UVB × ${(config.uvbValue || 0).toLocaleString()}</p>
        </div>

        <div className="p-4 bg-zinc-900 text-white rounded-2xl">
          <label className="text-[10px] font-bold opacity-50 uppercase tracking-widest block mb-1">Equivalencia ISS 2001 (+{(config.issMultiplier - 1) * 100}%)</label>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tighter">${(roundToNearestHundred(issValue) || 0).toLocaleString()}</span>
            <span className="text-xs opacity-50">COP</span>
          </div>
          <p className="text-[10px] mt-2 font-mono opacity-50">Código ISS: {proc.Codigo_ISS || 'Sin homologar'}</p>
        </div>

        <div className="pt-4 border-t border-zinc-100">
          <div className="flex justify-between text-xs mb-2">
            <span className="text-zinc-400">Grupo Quirúrgico:</span>
            <span className="font-bold text-zinc-700">{proc.Grupo_Quirurgico || 'N/A'}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400">Sección:</span>
            <span className="font-bold text-zinc-700">{proc.Seccion}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewsItem({ title, date, content, tag }: { title: string, date: string, content: string, tag: string }) {
  return (
    <div className="border-l-2 border-emerald-500 pl-6 space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">{tag}</span>
        <span className="text-[10px] text-zinc-400 font-mono">{date}</span>
      </div>
      <h4 className="font-bold text-zinc-800">{title}</h4>
      <p className="text-sm text-zinc-500 leading-relaxed">{content}</p>
    </div>
  );
}

function FooterLink({ label, href }: { label: string, href: string }) {
  return (
    <a href={href} className="text-xs font-bold text-zinc-400 hover:text-emerald-600 transition-colors uppercase tracking-widest">
      {label}
    </a>
  );
}
