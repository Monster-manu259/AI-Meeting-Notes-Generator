import { motion } from "framer-motion";
import { Clock, Users, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import type { Meeting } from "@/lib/api";

// const statusColors: Record<string, string> = {
//   completed: "bg-green-500/15 text-green-600 border-green-500/20",
//   processing: "bg-yellow-500/15 text-yellow-600 border-yellow-500/20",
//   scheduled: "bg-blue-500/15 text-blue-600 border-blue-500/20",
// };

interface MeetingCardProps {
  meeting: Meeting;
  index?: number;
}

export function MeetingCard({ meeting, index = 0 }: MeetingCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35 }}
    >
      <Link
        to={`/meeting/${meeting.id}`}
        className="group block glass rounded-xl p-5 hover:border-primary/30 transition-all duration-200"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {/* <Badge variant="outline" className={statusColors[meeting.status]}>
                {meeting.status}
              </Badge> */}
              {meeting.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
              {meeting.title}
            </h3>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              {meeting.duration && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {meeting.duration}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {meeting.participants.length}
              </span>
              <span>
                {new Date(meeting.date).toLocaleDateString("en-US", {
                  month: "short", day: "numeric",
                })}
              </span>
            </div>
            {meeting.summary && (
              <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                {meeting.summary}
              </p>
            )}
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
        </div>
      </Link>
    </motion.div>
  );
}