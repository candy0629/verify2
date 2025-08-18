import React, { useState } from 'react';
import { Check, Upload, User, Target, Home, AlertCircle, CheckCircle, Clipboard, Copy, ExternalLink, Shield } from 'lucide-react';
import Tesseract from 'tesseract.js';

interface VerificationData {
  playerName: string;
  gameScreenshot: File | null;
  robloxUserId?: string;
  robloxUsername?: string;
}

interface VerificationResult {
  step1Valid: boolean;
  step2Valid: boolean;
  step2KillCount?: number;
  step2PlayerFound?: boolean;
  step3Valid: boolean;
  step3UsernameMatch?: boolean;
  step3UserId?: string;
  overallValid: boolean;
}

function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<VerificationData>({
    playerName: '',
    gameScreenshot: null,
    robloxUserId: undefined,
    robloxUsername: undefined,
  });
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

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
      // 先嘗試英文識別（最穩定）
      const { data: { text: englishText } } = await Tesseract.recognize(file, 'eng', {
        logger: m => console.log('English OCR:', m),
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1'
      });
      
      // 嘗試中文繁體識別
      let chineseText = '';
      try {
        const { data: { text: chiTraText } } = await Tesseract.recognize(file, 'chi_tra', {
          logger: m => console.log('Chinese Traditional OCR:', m),
          tessedit_pageseg_mode: '6',
          preserve_interword_spaces: '1'
        });
        chineseText += chiTraText + ' ';
      } catch (error) {
        console.log('中文繁體識別失敗，跳過:', error);
      }
      
      // 嘗試中文簡體識別
      try {
        const { data: { text: chiSimText } } = await Tesseract.recognize(file, 'chi_sim', {
          logger: m => console.log('Chinese Simplified OCR:', m),
          tessedit_pageseg_mode: '6',
          preserve_interword_spaces: '1'
        });
        chineseText += chiSimText + ' ';
      } catch (error) {
        console.log('中文簡體識別失敗，跳過:', error);
      }
      
      // 合併所有識別結果
      const combinedText = englishText + ' ' + chineseText;
      
      console.log('英文 OCR 識別結果:', englishText);
      console.log('中文 OCR 識別結果:', chineseText);
      console.log('合併識別結果:', combinedText);
      
      // 清理文字，移除多餘的空白和換行
      const cleanText = combinedText.replace(/\s+/g, ' ').trim();
      
      // 改進的玩家名稱匹配邏輯
      const playerFound = findPlayerName(cleanText, data.playerName);
      
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

  // 新增：改進的玩家名稱匹配函數
  const findPlayerName = (text: string, playerName: string): boolean => {
    // 如果玩家名稱包含中文字符，使用不同的處理策略
    const hasChinese = /[\u4e00-\u9fff]/.test(playerName);
    const hasJapanese = /[\u3040-\u309f\u30a0-\u30ff]/.test(playerName);
    const hasKorean = /[\uac00-\ud7af]/.test(playerName);
    const isAsianLanguage = hasChinese || hasJapanese || hasKorean;
    
    // 正規化函數：移除或替換可能被 OCR 誤識的字符
    const normalizeText = (str: string): string => {
      return str
        // 只對非亞洲語言轉小寫
        .toLowerCase()
        // 移除所有空白字符
        .replace(/\s+/g, '')
        // 將常見的 OCR 誤識字符進行替換（僅對英文）
        .replace(/[|l1]/g, 'i')  // | l 1 -> i
        .replace(/[0o]/g, 'o')   // 0 -> o
        .replace(/[5s]/g, 's')   // 5 -> s
        .replace(/[8b]/g, 'b')   // 8 -> b
        .replace(/[6g]/g, 'g')   // 6 -> g
        // 處理底線和連字符的變體
        .replace(/[-_—–]/g, '_') // 各種連字符都轉為底線
        // 移除標點符號（保留中日韓文字和底線）
        .replace(/[^\w_\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g, '');
    };

    // 針對亞洲語言的特殊正規化
    const normalizeAsianText = (str: string): string => {
      return str
        // 保持原始大小寫
        // 移除空白但保留中文字符間的結構
        .replace(/\s+/g, '')
        // 處理全形和半形字符
        .replace(/[０-９]/g, (match) => String.fromCharCode(match.charCodeAt(0) - 0xFEE0))
        .replace(/[Ａ-Ｚａ-ｚ]/g, (match) => String.fromCharCode(match.charCodeAt(0) - 0xFEE0))
        // 處理各種連字符
        .replace(/[－＿—–_-]/g, '_')
        // 移除其他標點但保留中日韓文字
        .replace(/[^\w_\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g, '');
    };

    const normalizedText = normalizeText(text);
    const normalizedPlayerName = isAsianLanguage ? normalizeAsianText(playerName) : normalizeText(playerName);
    
    // 如果是亞洲語言，也對文字使用亞洲語言正規化
    const asianNormalizedText = isAsianLanguage ? normalizeAsianText(text) : normalizedText;
    
    console.log('原始文字:', text);
    console.log('正規化後文字:', normalizedText);
    if (isAsianLanguage) {
      console.log('亞洲語言正規化後文字:', asianNormalizedText);
    }
    console.log('正規化後玩家名稱:', normalizedPlayerName);
    console.log('是否為亞洲語言:', isAsianLanguage);
    
    // 方法1: 直接包含匹配
    const textToSearch = isAsianLanguage ? asianNormalizedText : normalizedText;
    if (textToSearch.includes(normalizedPlayerName)) {
      console.log('方法1匹配成功: 直接包含');
      return true;
    }
    
    // 針對中文的額外匹配方法
    if (isAsianLanguage) {
      // 嘗試不同的分割方式
      const segments = text.split(/[\s\-_.,;:|()[\]{}「」『』【】〈〉《》〔〕（）［］｛｝、。，；：！？～…—–]+/);
      for (const segment of segments) {
        const normalizedSegment = normalizeAsianText(segment);
        if (normalizedSegment === normalizedPlayerName) {
          console.log('亞洲語言分段匹配成功:', normalizedSegment, '<=>', normalizedPlayerName);
          return true;
        }
      }
      
      // 嘗試子字串匹配（對中文更寬鬆）
      if (normalizedPlayerName.length >= 2) {
        for (let i = 0; i <= asianNormalizedText.length - normalizedPlayerName.length; i++) {
          const substring = asianNormalizedText.substring(i, i + normalizedPlayerName.length);
          if (substring === normalizedPlayerName) {
            console.log('亞洲語言子字串匹配成功:', substring, '<=>', normalizedPlayerName);
            return true;
          }
        }
      }
    }
    
    // 方法2: 模糊匹配 - 允許一些字符差異
    const fuzzyMatch = (str1: string, str2: string, threshold: number = 0.75): boolean => {
      if (str2.length === 0) return false;
      
      // 計算編輯距離
      const matrix = Array(str1.length + 1).fill(null).map(() => Array(str2.length + 1).fill(null));
      
      for (let i = 0; i <= str1.length; i++) matrix[i][0] = i;
      for (let j = 0; j <= str2.length; j++) matrix[0][j] = j;
      
      for (let i = 1; i <= str1.length; i++) {
        for (let j = 1; j <= str2.length; j++) {
          if (str1[i - 1] === str2[j - 1]) {
            matrix[i][j] = matrix[i - 1][j - 1];
          } else {
            matrix[i][j] = Math.min(
              matrix[i - 1][j] + 1,     // 刪除
              matrix[i][j - 1] + 1,     // 插入
              matrix[i - 1][j - 1] + 1  // 替換
            );
          }
        }
      }
      
      const editDistance = matrix[str1.length][str2.length];
      const similarity = 1 - editDistance / Math.max(str1.length, str2.length);
      
      return similarity >= threshold;
    };
    
    // 對亞洲語言使用更高的相似度閾值
    const fuzzyThreshold = isAsianLanguage ? 0.85 : 0.75;
    const searchText = isAsianLanguage ? asianNormalizedText : normalizedText;
    
    // 在文字中尋找與玩家名稱相似的子字串
    for (let i = 0; i <= searchText.length - normalizedPlayerName.length; i++) {
      const substring = searchText.substring(i, i + normalizedPlayerName.length);
      if (fuzzyMatch(substring, normalizedPlayerName, fuzzyThreshold)) {
        console.log('方法2匹配成功: 模糊匹配', substring, '<=>', normalizedPlayerName);
        return true;
      }
    }
    
    // 方法3: 分詞匹配 - 將文字分割後逐個比對
    const words = searchText.split(/[\s\-_.,;:|]+/).filter(word => word.length > 0);
    for (const word of words) {
      const wordFuzzyThreshold = isAsianLanguage ? 0.9 : 0.8;
      if (word === normalizedPlayerName || fuzzyMatch(word, normalizedPlayerName, wordFuzzyThreshold)) {
        console.log('方法3匹配成功: 分詞匹配', word, '<=>', normalizedPlayerName);
        return true;
      }
    }
    
    console.log('所有匹配方法都失敗');
    return false;
  };

  // Roblox OAuth 授權流程
  const handleRobloxAuth = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    
    try {
      // 生成隨機狀態參數用於安全驗證
      const state = Math.random().toString(36).substring(2, 15);
      sessionStorage.setItem('roblox_auth_state', state);
      sessionStorage.setItem('expected_username', data.playerName);
      
      // 構建 Roblox OAuth URL
      const clientId = '4090460921469591553'; // Roblox OAuth Client ID
      const redirectUri = encodeURIComponent(window.location.origin + '/auth/callback');
      const scope = encodeURIComponent('openid profile');
      
      const authUrl = `https://apis.roblox.com/oauth/v1/authorize?` +
        `client_id=${clientId}&` +
        `redirect_uri=${redirectUri}&` +
        `scope=${scope}&` +
        `response_type=code&` +
        `state=${state}`;
      
      // 開啟新視窗進行授權
      const authWindow = window.open(
        authUrl,
        'roblox-auth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );
      
      // 監聽授權完成
      const checkClosed = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(checkClosed);
          // 檢查是否有授權結果
          const authResult = sessionStorage.getItem('roblox_auth_result');
          if (authResult) {
            const result = JSON.parse(authResult);
            setData(prev => ({
              ...prev,
              robloxUserId: result.userId,
              robloxUsername: result.username
            }));
            sessionStorage.removeItem('roblox_auth_result');
          } else {
            setAuthError('授權被取消或失敗，請重試');
          }
          setIsAuthenticating(false);
        }
      }, 1000);
      
      // 設置超時
      setTimeout(() => {
        if (!authWindow?.closed) {
          authWindow?.close();
          clearInterval(checkClosed);
          setIsAuthenticating(false);
          setAuthError('授權超時，請重試');
        }
      }, 300000); // 5分鐘超時
      
    } catch (error) {
      console.error('Roblox 授權錯誤:', error);
      setAuthError('授權過程中發生錯誤，請重試');
      setIsAuthenticating(false);
    }
  };

  // 處理授權回調
  const handleAuthCallback = async (code: string, state: string) => {
    try {
      // 驗證狀態參數
      const savedState = sessionStorage.getItem('roblox_auth_state');
      if (state !== savedState) {
        throw new Error('狀態參數不匹配，可能存在安全風險');
      }
      
      // 交換授權碼獲取訪問令牌
      const tokenResponse = await fetch('/api/roblox/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          redirect_uri: window.location.origin + '/auth/callback'
        })
      });
      
      if (!tokenResponse.ok) {
        throw new Error('獲取訪問令牌失敗');
      }
      
      const tokenData = await tokenResponse.json();
      
      // 使用訪問令牌獲取用戶信息
      const userResponse = await fetch('/api/roblox/userinfo', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`
        }
      });
      
      if (!userResponse.ok) {
        throw new Error('獲取用戶信息失敗');
      }
      
      const userData = await userResponse.json();
      
      // 保存授權結果
      sessionStorage.setItem('roblox_auth_result', JSON.stringify({
        userId: userData.sub,
        username: userData.preferred_username
      }));
      
      // 關閉授權視窗
      window.close();
      
    } catch (error) {
      console.error('處理授權回調失敗:', error);
      sessionStorage.setItem('roblox_auth_error', error.message);
      window.close();
    }
  };
  
  // 檢查是否為授權回調頁面
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    
    if (code && state) {
      handleAuthCallback(code, state);
    }
  }, []);

  const handleSubmit = async () => {
    if (!data.playerName || !data.gameScreenshot || !data.robloxUserId) {
      return;
    }

    setIsProcessing(true);

    try {
      // 步驟 1：檢查玩家名字
      const step1Valid = data.playerName.trim().length > 0;

      // 步驟 2：處理遊戲截圖
      const step2Data = await processStep2(data.gameScreenshot);
      const step2Valid = step2Data.killCount >= 3000 && step2Data.playerFound;

      // 步驟 3：驗證 Roblox 授權
      const step3UsernameMatch = data.robloxUsername?.toLowerCase() === data.playerName.toLowerCase();
      const step3Valid = step3UsernameMatch;

      const verificationResult: VerificationResult = {
        step1Valid,
        step2Valid,
        step2KillCount: step2Data.killCount,
        step2PlayerFound: step2Data.playerFound,
        step3Valid,
        step3UsernameMatch,
        step3UserId: data.robloxUserId,
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
    setData({ playerName: '', gameScreenshot: null, robloxUserId: undefined, robloxUsername: undefined });
    setResult(null);
    setIsProcessing(false);
    setIsAuthenticating(false);
    setAuthError(null);
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-800 mb-4">MT戰隊自動驗證系統</h1>
            <p className="text-lg text-gray-600">自動化驗證流程 - 擊殺數需達3000以上</p>
          </div>

          {/* 進度條 */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              {[1, 2, 3, 4].map((step) => (
                <div key={step} className="flex items-center">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      step <= currentStep
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {getStepIcon(step)}
                  </div>
                  {step < 4 && (
                    <div
                      className={`w-16 h-1 mx-2 ${
                        step < currentStep ? 'bg-indigo-600' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>玩家名字</span>
              <span>遊戲截圖</span>
              <span>Roblox 截圖</span>
              <span>驗證結果</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8">
            {/* 步驟 1: 玩家名字 */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-semibold text-gray-800 mb-2">步驟 1: 輸入玩家名字</h2>
                  <p className="text-gray-600">請輸入您的 Roblox 玩家名稱</p>
                </div>
                <div className="max-w-md mx-auto">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Roblox 玩家名稱
                  </label>
                  <input
                    type="text"
                    value={data.playerName}
                    onChange={(e) => setData(prev => ({ ...prev, playerName: e.target.value }))}
                    placeholder="請打出遊戲內顯示的名子"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                  <p className="text-sm text-gray-500 mt-2">
                    
                  </p>
                </div>
                <div className="flex justify-center">
                  <button
                    onClick={() => data.playerName.trim() && setCurrentStep(2)}
                    disabled={!data.playerName.trim()}
                    className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all font-medium"
                  >
                    下一步
                  </button>
                </div>
              </div>
            )}

            {/* 步驟 2: 遊戲截圖 */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-semibold text-gray-800 mb-2">步驟 2: 上傳遊戲擊殺截圖</h2>
                  <p className="text-gray-600">請上傳顯示擊殺數的遊戲截圖（需包含玩家名稱 "{data.playerName}"）</p>
                </div>
                <div className="max-w-md mx-auto">
                  <div 
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                      dragOver === 'gameScreenshot' 
                        ? 'border-indigo-500 bg-indigo-50' 
                        : 'border-gray-300 hover:border-indigo-400'
                    }`}
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
                      <span className="text-gray-500"> 或拖拽圖片到這裡</span>
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
                      <p className="text-sm text-green-600 mt-2">
                        ✓ 已選擇: {data.gameScreenshot.name}
                      </p>
                    )}
                  </div>
                  <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
                    <div className="flex items-start space-x-2">
                      <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-yellow-800">
                        <p className="font-medium">截圖要求：</p>
                        <ul className="mt-1 space-y-1">
                          <li>• 必須顯示玩家名稱 "{data.playerName}" 在左側</li>
                          <li>• 必須清楚顯示總擊殺數（需≥3000）</li>
                          <li>• 格式如：玩家名稱 - 月殺數 - 總擊殺數</li>
                          <li>• 圖片清晰易讀</li>
                          <li>• 支援各種語言和特殊符號（如底線_）</li>
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
                            ↑ 左側：玩家名稱（支援底線等符號），中間：月殺數，右側：總擊殺數（需≥3000）
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-center space-x-4">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-6 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-all font-medium"
                  >
                    上一步
                  </button>
                  <button
                    onClick={() => data.gameScreenshot && setCurrentStep(3)}
                    disabled={!data.gameScreenshot}
                    className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all font-medium"
                  >
                    下一步
                  </button>
                </div>
              </div>
            )}

            {/* 步驟 3: Roblox 授權驗證 */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-semibold text-gray-800 mb-2">步驟 3: Roblox 官方授權驗證</h2>
                  <p className="text-gray-600">通過 Roblox 官方授權來驗證您的身份 "{data.playerName}"</p>
                </div>
                
                <div className="max-w-md mx-auto">
                  {!data.robloxUserId ? (
                    <div className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center bg-blue-50">
                      <Shield className="w-16 h-16 text-blue-600 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-800 mb-2">Roblox 官方授權</h3>
                      <p className="text-gray-600 mb-6">
                        點擊下方按鈕，通過 Roblox 官方授權來驗證您的身份
                      </p>
                      
                      <button
                        onClick={handleRobloxAuth}
                        disabled={isAuthenticating}
                        className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all font-medium"
                      >
                        <ExternalLink className="w-5 h-5" />
                        <span>
                          {isAuthenticating ? '正在授權中...' : '使用 Roblox 授權'}
                        </span>
                      </button>
                      
                      {authError && (
                        <p className="text-red-600 text-sm mt-3">
                          {authError}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="border-2 border-green-300 rounded-lg p-6 text-center bg-green-50">
                      <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-green-800 mb-2">授權成功！</h3>
                      <div className="text-sm text-green-700 space-y-1">
                        <p>用戶 ID: {data.robloxUserId}</p>
                        <p>用戶名: {data.robloxUsername}</p>
                        <p className={data.robloxUsername?.toLowerCase() === data.playerName.toLowerCase() ? 'text-green-600' : 'text-red-600'}>
                          用戶名匹配: {data.robloxUsername?.toLowerCase() === data.playerName.toLowerCase() ? '✓ 匹配' : '✗ 不匹配'}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  </div>
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                    <div className="flex items-start space-x-2">
                      <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-blue-800">
                        <p className="font-medium">授權說明：</p>
                        <ul className="mt-1 space-y-1">
                          <li>• 使用 Roblox 官方 OAuth 授權系統</li>
                          <li>• 安全可靠，不會洩露您的密碼</li>
                          <li>• 自動驗證用戶名是否為 "{data.playerName}"</li>
                          <li>• 授權過程在新視窗中進行</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                
                <div className="flex justify-center space-x-4">
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="px-6 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-all font-medium"
                  >
                    上一步
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!data.robloxUserId || isProcessing}
                    className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all font-medium"
                  >
                    {isProcessing ? '正在驗證...' : '開始驗證'}
                  </button>
                </div>
              </div>
            )}

            {/* 步驟 4: 結果 */}
            {currentStep === 4 && result && (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-semibold text-gray-800 mb-2">驗證結果</h2>
                  <div className={`inline-flex items-center space-x-2 px-4 py-2 rounded-full ${
                    result.overallValid 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {result.overallValid ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <AlertCircle className="w-5 h-5" />
                    )}
                    <span className="font-medium">
                      {result.overallValid ? '驗證通過' : '驗證失敗'}
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* 步驟 1 結果 */}
                  <div className={`p-4 rounded-lg border-l-4 ${
                    result.step1Valid 
                      ? 'bg-green-50 border-green-400' 
                      : 'bg-red-50 border-red-400'
                  }`}>
                    <div className="flex items-center space-x-2">
                      {result.step1Valid ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      )}
                      <h3 className="font-medium">步驟 1: 玩家名稱</h3>
                    </div>
                    <p className="text-sm mt-1">
                      玩家名稱: {data.playerName}
                    </p>
                  </div>

                  {/* 步驟 2 結果 */}
                  <div className={`p-4 rounded-lg border-l-4 ${
                    result.step2Valid 
                      ? 'bg-green-50 border-green-400' 
                      : 'bg-red-50 border-red-400'
                  }`}>
                    <div className="flex items-center space-x-2">
                      {result.step2Valid ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      )}
                      <h3 className="font-medium">步驟 2: 遊戲擊殺截圖</h3>
                    </div>
                    <div className="text-sm mt-1 space-y-1">
                      <p>檢測到的擊殺數: {result.step2KillCount?.toLocaleString()}</p>
                      <p>是否找到玩家名稱: {result.step2PlayerFound ? '✓ 是' : '✗ 否'}</p>
                      {!result.step2PlayerFound && (
                        <p className="text-red-600 text-xs">
                          * 請確保截圖中清楚顯示玩家名稱 "{data.playerName}"，文字要清晰可讀
                        </p>
                      )}
                      {result.step2KillCount === 0 && (
                        <p className="text-red-600 text-xs">
                          * 無法識別擊殺數，請確保截圖清晰且數字可讀，建議重新截圖
                        </p>
                      )}
                      <p className={result.step2KillCount && result.step2KillCount >= 3000 ? 'text-green-600' : 'text-red-600'}>
                        擊殺數要求: {result.step2KillCount && result.step2KillCount >= 3000 ? '✓ 達標' : '✗ 未達標（需≥3000）'}
                      </p>
                    </div>
                  </div>

                  {/* 步驟 3 結果 */}
                  <div className={`p-4 rounded-lg border-l-4 ${
                    result.step3Valid 
                      ? 'bg-green-50 border-green-400' 
                      : 'bg-red-50 border-red-400'
                  }`}>
                    <div className="flex items-center space-x-2">
                      {result.step3Valid ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      )}
                      <h3 className="font-medium">步驟 3: Roblox 官方授權</h3>
                    </div>
                    <div className="text-sm mt-1 space-y-1">
                      <p>授權用戶 ID: {result.step3UserId}</p>
                      <p>授權用戶名: {data.robloxUsername}</p>
                      <p>用戶名匹配: {result.step3UsernameMatch ? '✓ 匹配' : '✗ 不匹配'}</p>
                    </div>
                  </div>
                </div>

                {result.overallValid && (
                  <div id="verification-result" className="bg-green-50 p-6 rounded-lg border border-green-200">
                    <div className="text-center">
                      <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                      <h3 className="text-xl font-semibold text-green-800 mb-2">恭喜！驗證通過</h3>
                      <p className="text-green-700">
                        玩家 "{data.playerName}" 已成功通過所有驗證步驟。
                      </p>
                    </div>
                    
                    {/* 詳細驗證信息 */}
                    <div className="mt-6 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="bg-white p-4 rounded-lg">
                          <div className="flex items-center space-x-2 mb-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="font-medium">步驟 1: 玩家名稱</span>
                          </div>
                          <p>玩家名稱: {data.playerName}</p>
                        </div>
                        
                        <div className="bg-white p-4 rounded-lg">
                          <div className="flex items-center space-x-2 mb-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="font-medium">步驟 2: 遊戲擊殺截圖</span>
                          </div>
                          <p>檢測到的擊殺數: {result.step2KillCount?.toLocaleString()}</p>
                          <p>是否找到玩家名稱: ✓ 是</p>
                          <p>擊殺數要求: ✓ 達標</p>
                        </div>
                        
                        <div className="bg-white p-4 rounded-lg">
                          <div className="flex items-center space-x-2 mb-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="font-medium">步驟 3: Roblox 官方授權</span>
                          </div>
                          <p>授權用戶 ID: {result.step3UserId}</p>
                          <p>授權用戶名: {data.robloxUsername}</p>
                          <p>用戶名匹配: ✓ 匹配</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {!result.overallValid && (
                  <div id="verification-result" className="bg-red-50 p-6 rounded-lg border border-red-200">
                    <div className="text-center">
                      <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
                      <h3 className="text-xl font-semibold text-red-800 mb-2">驗證未通過</h3>
                      <p className="text-red-700 mb-4">
                        請檢查上述失敗項目，修正後重新驗證，或改為手動驗證。
                      </p>
                    </div>
                    
                    {/* 顯示上傳的截圖供手動驗證 */}
                    <div className="mt-6">
                      <h4 className="text-lg font-medium text-gray-800 mb-4 text-center">若圖片沒問題，可直接複製給客服人員手動驗證</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* 遊戲截圖 */}
                        {data.gameScreenshot && (
                          <div className="bg-white p-4 rounded-lg border">
                            <h5 className="font-medium text-gray-800 mb-3 text-center">遊戲擊殺截圖</h5>
                            <div className="border rounded-lg overflow-hidden">
                              <img 
                                src={URL.createObjectURL(data.gameScreenshot)} 
                                alt="遊戲擊殺截圖" 
                                className="w-full h-auto max-h-64 object-contain bg-gray-50"
                              />
                            </div>
                            <div className="mt-2 text-sm text-gray-600">
                              <p>玩家名稱: {data.playerName}</p>
                              <p>檢測擊殺數: {result.step2KillCount?.toLocaleString() || '無法識別'}</p>
                              <p>名稱匹配: {result.step2PlayerFound ? '✓' : '✗'}</p>
                            </div>
                          </div>
                        )}
                        
                        {/* Roblox 授權信息 */}
                        <div className="bg-white p-4 rounded-lg border">
                          <h5 className="font-medium text-gray-800 mb-3 text-center">Roblox 官方授權</h5>
                          <div className="space-y-2 text-sm text-gray-600">
                            <div className="flex items-center justify-center space-x-2 p-4 bg-blue-50 rounded-lg">
                              <Shield className="w-8 h-8 text-blue-600" />
                              <div>
                                <p className="font-medium">授權驗證</p>
                                <p>用戶 ID: {result.step3UserId}</p>
                                <p>用戶名: {data.robloxUsername}</p>
                              </div>
                            </div>
                            <p>預期用戶名: {data.playerName}</p>
                            <p>用戶名匹配: {result.step3UsernameMatch ? '✓' : '✗'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 複製功能區域 */}
                <div className="mt-6 space-y-4">
                  <h4 className="text-lg font-medium text-gray-800 text-center">複製給客服人員</h4>
                  <div className="flex justify-center">
                    <button
                      onClick={copyVerificationScreenshot}
                      disabled={isCapturing}
                      className={`inline-flex items-center space-x-2 px-6 py-3 rounded-lg transition-all ${
                        copySuccess === 'screenshot' 
                          ? 'bg-green-600 text-white' 
                          : copySuccess === 'download'
                          ? 'bg-blue-600 text-white'
                          : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-800'
                      } ${isCapturing ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <Copy className="w-5 h-5" />
                      <span>
                        {isCapturing ? '正在截圖...' : 
                         copySuccess === 'screenshot' ? '驗證結果已複製！' :
                         copySuccess === 'download' ? '已下載截圖！' : '複製驗證結果截圖'}
                      </span>
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 text-center">
                    💡 複製截圖後可直接貼到 Discord 給客服人員查看
                  </p>
                </div>

                <div className="flex justify-center mt-6">
                  <button
                    onClick={resetForm}
                    className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-medium"
                  >
                    重新驗證
                  </button>
                </div>
              </div>
            )}

            {/* 處理中的狀態 */}
            {(isProcessing || isAuthenticating) && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-8 text-center">
                  <div className="animate-spin w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <h3 className="text-lg font-medium text-gray-800 mb-2">
                    {isAuthenticating ? '正在授權中...' : '正在驗證中...'}
                  </h3>
                  <p className="text-gray-600">
                    {isAuthenticating ? '請在新視窗中完成 Roblox 授權...' : '正在使用 OCR 技術分析您的截圖，請稍等...'}
                  </p>
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