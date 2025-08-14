import React, { useState } from 'react';
import { Check, Upload, User, Target, Home, AlertCircle, CheckCircle, Clipboard, Copy, Shield, Sparkles, Award } from 'lucide-react';
import Tesseract from 'tesseract.js';

interface VerificationData {
  playerName: string;
  gameScreenshot: File | null;
  robloxScreenshot: File | null;
}

interface VerificationResult {
  step1Valid: boolean;
  step2Valid: boolean;
  step2KillCount?: number;
  step2PlayerFound?: boolean;
  step3Valid: boolean;
  step3NameMatch?: boolean;
  overallValid: boolean;
}

function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<VerificationData>({
    playerName: '',
    gameScreenshot: null,
    robloxScreenshot: null,
  });
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const handleFileUpload = (field: 'gameScreenshot' | 'robloxScreenshot') => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0] || null;
    setData(prev => ({ ...prev, [field]: file }));
  };

  const handlePaste = (field: 'gameScreenshot' | 'robloxScreenshot') => async () => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const clipboardItem of clipboardItems) {
        for (const type of clipboardItem.types) {
          if (type.startsWith('image/')) {
            const blob = await clipboardItem.getType(type);
            const file = new File([blob], `pasted-image.${type.split('/')[1]}`, { type });
            setData(prev => ({ ...prev, [field]: file }));
            return;
          }
        }
      }
      alert('剪貼簿中沒有找到圖片');
    } catch (err) {
      console.error('無法讀取剪貼簿:', err);
      alert('無法讀取剪貼簿，請確保已允許剪貼簿權限');
    }
  };

  const handleDrop = (field: 'gameScreenshot' | 'robloxScreenshot') => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith('image/'));
    if (imageFile) {
      setData(prev => ({ ...prev, [field]: imageFile }));
    }
  };

  const handleDragOver = (field: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(field);
  };

  const handleDragLeave = () => {
    setDragOver(null);
  };

  const processStep2 = async (file: File): Promise<{ killCount: number; playerFound: boolean }> => {
    try {
      // 使用 Tesseract.js 進行 OCR 文字識別
      const { data: { text } } = await Tesseract.recognize(file, 'eng', {
        logger: m => console.log(m) // 可選：顯示處理進度
      });
      
      console.log('OCR 識別結果:', text);
      
      // 清理文字，移除多餘的空白和換行
      const cleanText = text.replace(/\s+/g, ' ').trim();
      
      // 尋找玩家名稱
      const playerFound = cleanText.toLowerCase().includes(data.playerName.toLowerCase());
      
      // 提取所有數字（3位數以上）
      const numbers = cleanText.match(/\d{3,}/g);
      let killCount = 0;
      
      if (numbers && numbers.length > 0) {
        // 如果有多個數字，取最大的那個（通常是總擊殺數）
        killCount = Math.max(...numbers.map(num => parseInt(num, 10)));
      }
      
      console.log('找到的數字:', numbers);
      console.log('最終擊殺數:', killCount);
      console.log('是否找到玩家名稱:', playerFound);
      
      return { killCount, playerFound };
      
    } catch (error) {
      console.error('OCR 處理錯誤:', error);
      // 如果 OCR 失敗，返回預設值
      return { killCount: 0, playerFound: false };
    }
  };

  const processStep3 = async (file: File): Promise<{ nameMatch: boolean }> => {
    try {
      // 使用 Tesseract.js 進行 OCR 文字識別
      const { data: { text } } = await Tesseract.recognize(file, 'eng', {
        logger: m => console.log(m)
      });
      
      console.log('Roblox 頁面 OCR 結果:', text);
      
      // 檢查是否包含玩家名稱
      const nameMatch = text.toLowerCase().includes(data.playerName.toLowerCase());
      
      console.log('用戶名匹配結果:', nameMatch);
      
      return { nameMatch };
      
    } catch (error) {
      console.error('Roblox 頁面 OCR 處理錯誤:', error);
      return { nameMatch: false };
    }
  };

  const handleSubmit = async () => {
    if (!data.playerName || !data.gameScreenshot || !data.robloxScreenshot) {
      return;
    }

    setIsProcessing(true);

    try {
      // 步驟 1：檢查玩家名字
      const step1Valid = data.playerName.trim().length > 0;

      // 步驟 2：處理遊戲截圖
      const step2Data = await processStep2(data.gameScreenshot);
      const step2Valid = step2Data.killCount >= 3000 && step2Data.playerFound;

      // 步驟 3：處理 Roblox 截圖
      const step3Data = await processStep3(data.robloxScreenshot);
      const step3Valid = step3Data.nameMatch;

      const verificationResult: VerificationResult = {
        step1Valid,
        step2Valid,
        step2KillCount: step2Data.killCount,
        step2PlayerFound: step2Data.playerFound,
        step3Valid,
        step3NameMatch: step3Data.nameMatch,
        overallValid: step1Valid && step2Valid && step3Valid,
      };

      setResult(verificationResult);
      setCurrentStep(4);
    } catch (error) {
      console.error('驗證過程中發生錯誤:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetForm = () => {
    setCurrentStep(1);
    setData({ playerName: '', gameScreenshot: null, robloxScreenshot: null });
    setResult(null);
    setIsProcessing(false);
  };

  const copyVerificationScreenshot = async () => {
    if (!result) return;
    
    setIsCapturing(true);
    
    try {
      // 等待一小段時間確保 UI 更新完成
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const resultElement = document.getElementById('verification-result');
      if (!resultElement) {
        throw new Error('找不到驗證結果元素');
      }

      // 動態導入 html2canvas
      const html2canvas = (await import('html2canvas')).default;
      
      // 生成截圖
      const canvas = await html2canvas(resultElement, {
        backgroundColor: '#ffffff',
        scale: 2, // 提高解析度
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: resultElement.scrollWidth,
        height: resultElement.scrollHeight,
      });
      
      // 將 canvas 轉換為 blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          throw new Error('無法生成截圖');
        }
        
        try {
          // 複製到剪貼簿
          await navigator.clipboard.write([
            new ClipboardItem({
              'image/png': blob
            })
          ]);
          
          setCopySuccess('screenshot');
          setTimeout(() => setCopySuccess(null), 3000);
        } catch (clipboardError) {
          console.error('複製到剪貼簿失敗:', clipboardError);
          
          // 如果剪貼簿失敗，提供下載選項
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `驗證結果_${data.playerName}_${new Date().toISOString().slice(0, 10)}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          setCopySuccess('download');
          setTimeout(() => setCopySuccess(null), 3000);
        }
      }, 'image/png');
      
    } catch (error) {
      console.error('截圖失敗:', error);
      alert('截圖失敗，請稍後再試');
    } finally {
      setIsCapturing(false);
    }
  };


  const getStepIcon = (step: number) => {
    if (step === 1) return <User className="w-6 h-6" />;
    if (step === 2) return <Target className="w-6 h-6" />;
    if (step === 3) return <Home className="w-6 h-6" />;
    return <CheckCircle className="w-6 h-6" />;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 relative overflow-hidden">
      {/* 背景裝飾元素 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-indigo-600/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-purple-400/20 to-pink-600/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-r from-cyan-400/10 to-blue-600/10 rounded-full blur-3xl"></div>
      </div>
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12 relative">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mb-6 shadow-lg shadow-indigo-500/25">
              <Shield className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-gray-800 via-gray-900 to-indigo-800 bg-clip-text text-transparent mb-4">
              Roblox 玩家驗證系統
            </h1>
            <div className="flex items-center justify-center space-x-2 text-lg text-gray-600">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              <span>智能 OCR 自動化驗證流程</span>
              <Sparkles className="w-5 h-5 text-indigo-500" />
            </div>
            <p className="text-gray-500 mt-2">擊殺數需達 3000 以上</p>
          </div>

          {/* 進度條 */}
          <div className="mb-12">
            <div className="flex items-center justify-between mb-6 relative">
              {[1, 2, 3, 4].map((step) => (
                <div key={step} className="flex items-center relative z-10">
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 transform ${
                      step <= currentStep
                        ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/30 scale-110'
                        : 'bg-white text-gray-400 shadow-md border-2 border-gray-200'
                    } ${step === currentStep ? 'ring-4 ring-indigo-200 ring-opacity-50' : ''}`}
                  >
                    {getStepIcon(step)}
                  </div>
                  {step < 4 && (
                    <div className="relative mx-4">
                      <div className="w-20 h-1 bg-gray-200 rounded-full"></div>
                      <div
                        className={`absolute top-0 left-0 h-1 rounded-full transition-all duration-700 ${
                          step < currentStep 
                            ? 'w-full bg-gradient-to-r from-indigo-500 to-purple-600' 
                            : 'w-0 bg-gradient-to-r from-indigo-500 to-purple-600'
                        }`}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm font-medium">
              <span className={`transition-colors duration-300 ${currentStep >= 1 ? 'text-indigo-600' : 'text-gray-500'}`}>玩家名字</span>
              <span className={`transition-colors duration-300 ${currentStep >= 2 ? 'text-indigo-600' : 'text-gray-500'}`}>遊戲截圖</span>
              <span className={`transition-colors duration-300 ${currentStep >= 3 ? 'text-indigo-600' : 'text-gray-500'}`}>Roblox 截圖</span>
              <span className={`transition-colors duration-300 ${currentStep >= 4 ? 'text-indigo-600' : 'text-gray-500'}`}>驗證結果</span>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl shadow-gray-900/10 p-8 border border-white/20 relative overflow-hidden">
            {/* 卡片內部裝飾 */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-indigo-100/50 to-transparent rounded-full -translate-y-16 translate-x-16"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-purple-100/50 to-transparent rounded-full translate-y-12 -translate-x-12"></div>
            
            {/* 步驟 1: 玩家名字 */}
            {currentStep === 1 && (
              <div className="space-y-8 relative z-10">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl mb-4 shadow-lg shadow-blue-500/25">
                    <User className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-3xl font-bold text-gray-800 mb-3">輸入玩家名字</h2>
                  <p className="text-gray-600 text-lg">請輸入您的 Roblox 玩家名稱</p>
                </div>
                <div className="max-w-md mx-auto">
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Roblox 玩家名稱
                  </label>
                  <input
                    type="text"
                    value={data.playerName}
                    onChange={(e) => setData(prev => ({ ...prev, playerName: e.target.value }))}
                    placeholder="請打出遊戲內顯示的名子"
                    className="w-full px-6 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-300 text-lg font-medium bg-gray-50/50 hover:bg-white"
                  />
                </div>
                <div className="flex justify-center">
                  <button
                    onClick={() => data.playerName.trim() && setCurrentStep(2)}
                    disabled={!data.playerName.trim()}
                    className="px-10 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all duration-300 font-semibold text-lg shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 transform hover:scale-105 disabled:transform-none"
                  >
                    下一步
                  </button>
                </div>
              </div>
            )}

            {/* 步驟 2: 遊戲截圖 */}
            {currentStep === 2 && (
              <div className="space-y-8 relative z-10">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl mb-4 shadow-lg shadow-green-500/25">
                    <Target className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-3xl font-bold text-gray-800 mb-3">上傳遊戲擊殺截圖</h2>
                  <p className="text-gray-600 text-lg">請上傳顯示擊殺數的遊戲截圖</p>
                  <p className="text-sm text-indigo-600 font-medium">需包含玩家名稱 "{data.playerName}"</p>
                </div>
                <div className="max-w-md mx-auto">
                  <div 
                    className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300 ${
                      dragOver === 'gameScreenshot' 
                        ? 'border-indigo-500 bg-indigo-50/50 scale-105 shadow-lg' 
                        : data.gameScreenshot
                        ? 'border-green-400 bg-green-50/50'
                        : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/30'
                    } ${data.gameScreenshot ? 'shadow-md' : ''}`}
                    onDrop={handleDrop('gameScreenshot')}
                    onDragOver={handleDragOver('gameScreenshot')}
                    onDragLeave={handleDragLeave}
                  >
                    <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload('gameScreenshot')}
                      className="hidden"
                      id="gameScreenshot"
                    />
                    <label htmlFor="gameScreenshot" className="cursor-pointer">
                      <span className="text-indigo-600 font-medium">點擊選擇圖片</span>
                      <span className="text-gray-500 block mt-1">或拖拽圖片到這裡</span>
                    </label>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={handlePaste('gameScreenshot')}
                        className="inline-flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm"
                      >
                        <Clipboard className="w-4 h-4" />
                        <span>從剪貼簿貼上</span>
                      </button>
                    </div>
                    {data.gameScreenshot && (
                      <p className="text-sm text-green-600 mt-4 font-medium bg-green-50 px-3 py-2 rounded-lg inline-block">
                        <CheckCircle className="w-4 h-4 inline mr-1" />
                        已選擇: {data.gameScreenshot.name}
                      </p>
                    )}
                  </div>
                  <div className="mt-6 p-6 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-2xl border border-yellow-200/50">
                    <div className="flex items-start space-x-2">
                      <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-yellow-800">
                        <p className="font-medium">截圖要求：</p>
                        <ul className="mt-1 space-y-1">
                          <li>• 必須顯示玩家名稱 "{data.playerName}" 在左側</li>
                          <li>• 必須清楚顯示總擊殺數（需≥3000）</li>
                          <li>• 格式如：玩家名稱 - 月殺數 - 總擊殺數</li>
                          <li>• 圖片清晰易讀</li>
                        </ul>
                        <div className="mt-3">
                          <p className="font-medium mb-2">參考示例：</p>
                          <div className="bg-gray-800 text-white p-3 rounded text-xs font-mono">
                            <div className="flex justify-between items-center">
                              <span>Aeris</span>
                              <span>998</span>
                              <span>10306</span>
                            </div>
                          </div>
                          <p className="text-xs mt-1 text-yellow-700">
                            ↑ 左側：玩家名稱，中間：月殺數，右側：總擊殺數（這個數字需≥3000）
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-center space-x-4">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-8 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-all duration-300 font-semibold shadow-md hover:shadow-lg transform hover:scale-105"
                  >
                    上一步
                  </button>
                  <button
                    onClick={() => data.gameScreenshot && setCurrentStep(3)}
                    disabled={!data.gameScreenshot}
                    className="px-10 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all duration-300 font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 transform hover:scale-105 disabled:transform-none"
                  >
                    下一步
                  </button>
                </div>
              </div>
            )}

            {/* 步驟 3: Roblox 截圖 */}
            {currentStep === 3 && (
              <div className="space-y-8 relative z-10">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl mb-4 shadow-lg shadow-purple-500/25">
                    <Home className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-3xl font-bold text-gray-800 mb-3">上傳 Roblox 主頁截圖</h2>
                  <p className="text-gray-600 text-lg">請上傳 Roblox 主頁截圖</p>
                  <p className="text-sm text-indigo-600 font-medium">確認右上角用戶名為 "{data.playerName}"</p>
                </div>
                <div className="max-w-md mx-auto">
                  <div 
                    className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300 ${
                      dragOver === 'robloxScreenshot' 
                        ? 'border-indigo-500 bg-indigo-50/50 scale-105 shadow-lg' 
                        : data.robloxScreenshot
                        ? 'border-green-400 bg-green-50/50'
                        : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/30'
                    } ${data.robloxScreenshot ? 'shadow-md' : ''}`}
                    onDrop={handleDrop('robloxScreenshot')}
                    onDragOver={handleDragOver('robloxScreenshot')}
                    onDragLeave={handleDragLeave}
                  >
                    <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload('robloxScreenshot')}
                      className="hidden"
                      id="robloxScreenshot"
                    />
                    <label htmlFor="robloxScreenshot" className="cursor-pointer">
                      <span className="text-indigo-600 font-medium">點擊選擇圖片</span>
                      <span className="text-gray-500 block mt-1">或拖拽圖片到這裡</span>
                    </label>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={handlePaste('robloxScreenshot')}
                        className="inline-flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm"
                      >
                        <Clipboard className="w-4 h-4" />
                        <span>從剪貼簿貼上</span>
                      </button>
                    </div>
                    {data.robloxScreenshot && (
                      <p className="text-sm text-green-600 mt-4 font-medium bg-green-50 px-3 py-2 rounded-lg inline-block">
                        <CheckCircle className="w-4 h-4 inline mr-1" />
                        已選擇: {data.robloxScreenshot.name}
                      </p>
                    )}
                  </div>
                  <div className="mt-6 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-200/50">
                    <div className="flex items-start space-x-2">
                      <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-blue-800">
                        <p className="font-medium">截圖要求：</p>
                        <ul className="mt-1 space-y-1">
                          <li>• 必須是 Roblox 官方網站主頁</li>
                          <li>• 右上角用戶名必須顯示 "{data.playerName}"</li>
                          <li>• 確保是已登入狀態</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-center space-x-4">
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="px-8 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-all duration-300 font-semibold shadow-md hover:shadow-lg transform hover:scale-105"
                  >
                    上一步
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!data.robloxScreenshot || isProcessing}
                    className="px-10 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all duration-300 font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 transform hover:scale-105 disabled:transform-none"
                  >
                    {isProcessing ? '正在驗證...' : '開始驗證'}
                  </button>
                </div>
              </div>
            )}

            {/* 步驟 4: 結果 */}
            {currentStep === 4 && result && (
              <div className="space-y-8 relative z-10">
                <div className="text-center">
                  <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-lg ${
                    result.overallValid 
                      ? 'bg-gradient-to-br from-green-500 to-emerald-600 shadow-green-500/25' 
                      : 'bg-gradient-to-br from-red-500 to-pink-600 shadow-red-500/25'
                  }`}>
                    {result.overallValid ? <Award className="w-8 h-8 text-white" /> : <AlertCircle className="w-8 h-8 text-white" />}
                  </div>
                  <h2 className="text-3xl font-bold text-gray-800 mb-4">驗證結果</h2>
                  <div className={`inline-flex items-center space-x-3 px-6 py-3 rounded-2xl shadow-lg ${
                    result.overallValid 
                      ? 'bg-gradient-to-r from-green-100 to-emerald-100 text-green-800 border border-green-200' 
                      : 'bg-gradient-to-r from-red-100 to-pink-100 text-red-800 border border-red-200'
                  }`}>
                    {result.overallValid ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <AlertCircle className="w-5 h-5" />
                    )}
                    <span className="font-bold text-lg">
                      {result.overallValid ? '驗證通過' : '驗證失敗'}
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* 步驟 1 結果 */}
                  <div className={`p-6 rounded-2xl border-l-4 transition-all duration-300 ${
                    result.step1Valid 
                      ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-400 shadow-md' 
                      : 'bg-gradient-to-r from-red-50 to-pink-50 border-red-400 shadow-md'
                  }`}>
                    <div className="flex items-center space-x-2">
                      {result.step1Valid ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      )}
                      <h3 className="font-bold text-lg">步驟 1: 玩家名稱</h3>
                    </div>
                    <p className="text-sm mt-2 font-medium">
                      玩家名稱: {data.playerName}
                    </p>
                  </div>

                  {/* 步驟 2 結果 */}
                  <div className={`p-6 rounded-2xl border-l-4 transition-all duration-300 ${
                    result.step2Valid 
                      ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-400 shadow-md' 
                      : 'bg-gradient-to-r from-red-50 to-pink-50 border-red-400 shadow-md'
                  }`}>
                    <div className="flex items-center space-x-2">
                      {result.step2Valid ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      )}
                      <h3 className="font-bold text-lg">步驟 2: 遊戲擊殺截圖</h3>
                    </div>
                    <div className="text-sm mt-2 space-y-1 font-medium">
                      <p>檢測到的擊殺數: <span className="font-bold">{result.step2KillCount?.toLocaleString()}</span></p>
                      <p>是否找到玩家名稱: <span className={result.step2PlayerFound ? 'text-green-600' : 'text-red-600'}>{result.step2PlayerFound ? '✓ 是' : '✗ 否'}</span></p>
                      {!result.step2PlayerFound && (
                        <p className="text-red-600 text-xs bg-red-100 p-2 rounded-lg mt-2">
                          * 請確保截圖中清楚顯示玩家名稱 "{data.playerName}"，文字要清晰可讀
                        </p>
                      )}
                      {result.step2KillCount === 0 && (
                        <p className="text-red-600 text-xs bg-red-100 p-2 rounded-lg mt-2">
                          * 無法識別擊殺數，請確保截圖清晰且數字可讀
                        </p>
                      )}
                      <p className={`font-bold ${result.step2KillCount && result.step2KillCount >= 3000 ? 'text-green-600' : 'text-red-600'}`}>
                        擊殺數要求: {result.step2KillCount && result.step2KillCount >= 3000 ? '✓ 達標' : '✗ 未達標（需≥3000）'}
                      </p>
                    </div>
                  </div>

                  {/* 步驟 3 結果 */}
                  <div className={`p-6 rounded-2xl border-l-4 transition-all duration-300 ${
                    result.step3Valid 
                      ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-400 shadow-md' 
                      : 'bg-gradient-to-r from-red-50 to-pink-50 border-red-400 shadow-md'
                  }`}>
                    <div className="flex items-center space-x-2">
                      {result.step3Valid ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      )}
                      <h3 className="font-bold text-lg">步驟 3: Roblox 主頁截圖</h3>
                    </div>
                    <p className="text-sm mt-2 font-medium">
                      用戶名匹配: <span className={result.step3NameMatch ? 'text-green-600' : 'text-red-600'}>{result.step3NameMatch ? '✓ 匹配' : '✗ 不匹配'}</span>
                    </p>
                  </div>
                </div>

                {result.overallValid && (
                  <div id="verification-result" className="bg-gradient-to-br from-green-50 via-emerald-50 to-green-100 p-8 rounded-3xl border-2 border-green-200 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-green-200/30 to-transparent rounded-full -translate-y-16 translate-x-16"></div>
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl mb-6 shadow-lg shadow-green-500/30">
                        <Award className="w-10 h-10 text-white" />
                      </div>
                      <h3 className="text-3xl font-bold text-green-800 mb-3">🎉 恭喜！驗證通過</h3>
                      <p className="text-green-700 text-lg font-medium">
                        玩家 "{data.playerName}" 已成功通過所有驗證步驟。
                      </p>
                    </div>
                    
                    {/* 詳細驗證信息 */}
                    <div className="mt-8 space-y-4 relative z-10">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="bg-white/80 backdrop-blur-sm p-5 rounded-2xl shadow-md border border-white/50">
                          <div className="flex items-center space-x-2 mb-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="font-bold">步驟 1: 玩家名稱</span>
                          </div>
                          <p className="font-medium">玩家名稱: {data.playerName}</p>
                        </div>
                        
                        <div className="bg-white/80 backdrop-blur-sm p-5 rounded-2xl shadow-md border border-white/50">
                          <div className="flex items-center space-x-2 mb-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="font-bold">步驟 2: 遊戲擊殺截圖</span>
                          </div>
                          <p className="font-medium">檢測到的擊殺數: {result.step2KillCount?.toLocaleString()}</p>
                          <p className="font-medium">是否找到玩家名稱: ✓ 是</p>
                          <p className="font-medium">擊殺數要求: ✓ 達標</p>
                        </div>
                        
                        <div className="bg-white/80 backdrop-blur-sm p-5 rounded-2xl shadow-md border border-white/50">
                          <div className="flex items-center space-x-2 mb-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="font-bold">步驟 3: Roblox 主頁截圖</span>
                          </div>
                          <p className="font-medium">用戶名匹配: ✓ 匹配</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {!result.overallValid && (
                  <div id="verification-result" className="bg-gradient-to-br from-red-50 via-pink-50 to-red-100 p-8 rounded-3xl border-2 border-red-200 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-red-200/30 to-transparent rounded-full -translate-y-16 translate-x-16"></div>
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-red-500 to-pink-600 rounded-3xl mb-6 shadow-lg shadow-red-500/30">
                        <AlertCircle className="w-10 h-10 text-white" />
                      </div>
                      <h3 className="text-3xl font-bold text-red-800 mb-3">驗證未通過</h3>
                      <p className="text-red-700 mb-4 text-lg font-medium">
                        請檢查上述失敗項目，修正後重新驗證，若一直失敗可改為手動驗證。
                      </p>
                    </div>
                  </div>
                )}

                {/* 複製功能區域 */}
                <div className="mt-8 space-y-6">
                  <h4 className="text-xl font-bold text-gray-800 text-center">複製給管理員</h4>
                  <div className="flex justify-center">
                    <button
                      onClick={copyVerificationScreenshot}
                      disabled={isCapturing}
                      className={`inline-flex items-center space-x-3 px-8 py-4 rounded-2xl transition-all duration-300 font-semibold text-lg shadow-lg transform ${
                        copySuccess === 'screenshot' 
                          ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-green-500/30' 
                          : copySuccess === 'download'
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-blue-500/30'
                          : 'bg-gradient-to-r from-indigo-100 to-purple-100 hover:from-indigo-200 hover:to-purple-200 text-indigo-800 shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:scale-105'
                      } ${isCapturing ? 'opacity-50 cursor-not-allowed transform-none' : ''}`}
                    >
                      <Copy className="w-6 h-6" />
                      <span>
                        {isCapturing ? '正在截圖...' : 
                         copySuccess === 'screenshot' ? '驗證結果已複製！' :
                         copySuccess === 'download' ? '已下載截圖！' : '複製驗證結果截圖'}
                      </span>
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 text-center font-medium">
                    💡 複製截圖後可直接貼到 Discord 給管理員查看
                  </p>
                </div>

                <div className="flex justify-center mt-6">
                  <button
                    onClick={resetForm}
                    className="px-10 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 font-semibold text-lg shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 transform hover:scale-105"
                  >
                    重新驗證
                  </button>
                </div>
              </div>
            )}

            {/* 處理中的狀態 */}
            {isProcessing && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-10 text-center shadow-2xl border border-white/20">
                  <div className="relative mb-6">
                    <div className="animate-spin w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto"></div>
                    <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-r-purple-600 rounded-full mx-auto animate-spin" style={{animationDirection: 'reverse', animationDuration: '1.5s'}}></div>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800 mb-3">正在驗證中...</h3>
                  <p className="text-gray-600 text-lg">正在使用 AI OCR 技術分析您的截圖</p>
                  <p className="text-sm text-gray-500 mt-2">請稍等片刻...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;