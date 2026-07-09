import { useState } from "react";
import { Instagram, Lock, User, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export function Login() {
  const [username, setUsername] = useState("ayse.demir");
  const [password, setPassword] = useState("••••••••••");

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#1a0f2e] via-[#2b1050] to-[#4a1942] flex items-center justify-center p-6">
      <Card className="w-full max-w-sm border-white/10 bg-white/[0.06] backdrop-blur-xl p-8 rounded-3xl shadow-2xl">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] flex items-center justify-center shadow-lg shadow-pink-900/30">
            <Instagram className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-white text-xl font-semibold tracking-tight">Otomasyon Paneli</h1>
          <p className="text-white/50 text-sm text-center">
            Devam etmek için Instagram hesabınla giriş yap
          </p>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Kullanıcı adı"
              className="pl-9 h-11 bg-white/[0.07] border-white/10 text-white placeholder:text-white/30 rounded-xl focus-visible:ring-pink-500/50"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Şifre"
              className="pl-9 h-11 bg-white/[0.07] border-white/10 text-white placeholder:text-white/30 rounded-xl focus-visible:ring-pink-500/50"
            />
          </div>

          <Button className="w-full h-11 rounded-xl bg-gradient-to-r from-[#d62976] to-[#4f5bd5] hover:opacity-90 text-white font-medium mt-2">
            Giriş Yap
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        <div className="flex items-center gap-2 mt-6 text-white/35 text-xs justify-center">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Bilgilerin bu cihazda saklanır, sunucuya gönderilmez</span>
        </div>
      </Card>
    </div>
  );
}
