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
  LogOut,
  Inbox,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type FollowedAccount = {
  name: string;
  likes: number;
  avatarColor?: string;
};

export type ActivityItem = {
  user: string;
  type: string;
  icon: React.ComponentType<{ className?: string }>;
  time: string;
};

export type DashboardProps = {
  onLogout: () => void;
  accountHandle?: string;
  stats?: {
    today: number;
    month: number;
    year: number;
    allTime: number;
  };
  followedAccounts?: FollowedAccount[];
  activityFeed?: ActivityItem[];
};

const statConfig = [
  { key: "today" as const, label: "Bugün", icon: Clock },
  { key: "month" as const, label: "Bu Ay", icon: Calendar },
  { key: "year" as const, label: "Bu Yıl", icon: CalendarDays },
  { key: "allTime" as const, label: "Tüm Zamanlar", icon: InfinityIcon },
];

export default function Dashboard({
  onLogout,
  accountHandle,
  stats,
  followedAccounts = [],
  activityFeed = [],
}: DashboardProps) {
  const [active, setActive] = useState(true);

  return (
    <div className="min-h-screen w-full bg-[#0d0a14] text-white p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] flex items-center justify-center">
              <Instagram className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-lg leading-tight">Otomasyon Paneli</h1>
              <p className="text-white/40 text-xs">{accountHandle ? `@${accountHandle}` : "Hesap bağlı değil"}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* On/Off toggle */}
            <Card className="flex items-center gap-3 bg-white/[0.05] border-white/10 rounded-2xl px-4 py-2.5">
              <Power className={`w-4 h-4 ${active ? "text-emerald-400" : "text-white/30"}`} />
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-medium">{active ? "Sistem Aktif" : "Sistem Kapalı"}</span>
                <span className="text-[11px] text-white/40">Her 10 dk kontrol</span>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </Card>
            <Button
              variant="ghost"
              size="icon"
              onClick={onLogout}
              className="text-white/50 hover:text-white hover:bg-white/10"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Stat cards */}
        {stats === undefined ? (
          <Card className="bg-white/[0.05] border-white/10 rounded-2xl p-5">
            <EmptyState label="Henüz istatistik yok" />
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statConfig.map((s) => (
              <Card
                key={s.key}
                className="bg-white/[0.05] border-white/10 rounded-2xl p-4 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-white/40 text-xs">{s.label}</span>
                  <s.icon className="w-4 h-4 text-white/30" />
                </div>
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-pink-500 fill-pink-500" />
                  <span className="text-2xl font-semibold tabular-nums">
                    {stats[s.key].toLocaleString("tr-TR")}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}

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
            {followedAccounts.length === 0 ? (
              <EmptyState label="Henüz veri yok" />
            ) : (
              <div className="space-y-1">
                {followedAccounts.map((a, i) => (
                  <div
                    key={a.name}
                    className="flex items-center gap-3 py-2.5 px-2 rounded-xl hover:bg-white/[0.04] transition-colors"
                  >
                    <span className="text-white/25 text-xs w-4">{i + 1}</span>
                    <Avatar className="w-8 h-8">
                      <AvatarFallback
                        className={`bg-gradient-to-tr ${a.avatarColor ?? "from-white/20 to-white/10"} text-white text-xs`}
                      >
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
            )}
          </Card>

          {/* Recent activity feed */}
          <Card className="md:col-span-2 bg-white/[0.05] border-white/10 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-white/50" />
              <h2 className="font-medium text-sm">Son Kontroller</h2>
            </div>
            {activityFeed.length === 0 ? (
              <EmptyState label="Henüz aktivite yok" />
            ) : (
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
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-white/30">
      <Inbox className="w-6 h-6" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
