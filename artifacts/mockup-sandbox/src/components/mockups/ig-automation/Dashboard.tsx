import { useState } from "react";
import {
  Instagram,
  Power,
  Heart,
  Users,
  Clock,
  Calendar,
  CalendarDays,
  Infinity as InfinityIcon,
  Film,
  Image as ImageIcon,
  BookOpen,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const followedAccounts = [
  { name: "melis.ozturk", likes: 128, avatarColor: "from-pink-400 to-rose-500" },
  { name: "kerem.aydin", likes: 96, avatarColor: "from-indigo-400 to-violet-500" },
  { name: "defne.travel", likes: 84, avatarColor: "from-amber-400 to-orange-500" },
  { name: "burak.fit", likes: 71, avatarColor: "from-emerald-400 to-teal-500" },
  { name: "elif.art", likes: 63, avatarColor: "from-sky-400 to-blue-500" },
];

const statPeriods = [
  { label: "Bugün", value: "42", icon: Clock },
  { label: "Bu Ay", value: "1.284", icon: Calendar },
  { label: "Bu Yıl", value: "9.630", icon: CalendarDays },
  { label: "Tüm Zamanlar", value: "24.912", icon: InfinityIcon },
];

const activityFeed = [
  { user: "melis.ozturk", type: "Hikaye", icon: BookOpen, time: "2 dk önce" },
  { user: "kerem.aydin", type: "Reels", icon: Film, time: "9 dk önce" },
  { user: "defne.travel", type: "Gönderi", icon: ImageIcon, time: "24 dk önce" },
  { user: "elif.art", type: "Hikaye", icon: BookOpen, time: "41 dk önce" },
];

export function Dashboard() {
  const [active, setActive] = useState(true);

  return (
    <div className="min-h-screen w-full bg-[#0d0a14] text-white p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] flex items-center justify-center">
              <Instagram className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-lg leading-tight">Otomasyon Paneli</h1>
              <p className="text-white/40 text-xs">@ayse.demir</p>
            </div>
          </div>

          {/* On/Off toggle */}
          <Card className="flex items-center gap-3 bg-white/[0.05] border-white/10 rounded-2xl px-4 py-2.5">
            <Power className={`w-4 h-4 ${active ? "text-emerald-400" : "text-white/30"}`} />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-medium">{active ? "Sistem Aktif" : "Sistem Kapalı"}</span>
              <span className="text-[11px] text-white/40">Her 10 dk kontrol</span>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </Card>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statPeriods.map((s) => (
            <Card
              key={s.label}
              className="bg-white/[0.05] border-white/10 rounded-2xl p-4 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-white/40 text-xs">{s.label}</span>
                <s.icon className="w-4 h-4 text-white/30" />
              </div>
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-pink-500 fill-pink-500" />
                <span className="text-2xl font-semibold tabular-nums">{s.value}</span>
              </div>
            </Card>
          ))}
        </div>

        <div className="grid md:grid-cols-5 gap-6">
          {/* Followed accounts leaderboard */}
          <Card className="md:col-span-3 bg-white/[0.05] border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-white/50" />
                <h2 className="font-medium text-sm">Kimleri Beğendi</h2>
              </div>
              <Badge variant="secondary" className="bg-white/10 text-white/60 border-0">
                {followedAccounts.length} hesap
              </Badge>
            </div>
            <div className="space-y-1">
              {followedAccounts.map((a, i) => (
                <div
                  key={a.name}
                  className="flex items-center gap-3 py-2.5 px-2 rounded-xl hover:bg-white/[0.04] transition-colors"
                >
                  <span className="text-white/25 text-xs w-4">{i + 1}</span>
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className={`bg-gradient-to-tr ${a.avatarColor} text-white text-xs`}>
                      {a.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm flex-1">{a.name}</span>
                  <div className="flex items-center gap-1.5 text-white/60 text-sm tabular-nums">
                    <Heart className="w-3.5 h-3.5 text-pink-500 fill-pink-500" />
                    {a.likes}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Recent activity feed */}
          <Card className="md:col-span-2 bg-white/[0.05] border-white/10 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-white/50" />
              <h2 className="font-medium text-sm">Son Kontroller</h2>
            </div>
            <div className="space-y-4">
              {activityFeed.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-white/[0.08] flex items-center justify-center shrink-0 mt-0.5">
                    <item.icon className="w-3.5 h-3.5 text-white/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{item.user}</span>{" "}
                      <span className="text-white/50">{item.type.toLowerCase()} beğenildi</span>
                    </p>
                    <p className="text-white/30 text-xs mt-0.5">{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
