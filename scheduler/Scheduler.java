import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.Executors;

/** Internal service. Receives database snapshots; never owns durable queue state. */
public final class Scheduler {
    record Visit(long id, int priority, long arrived) {}
    static final Comparator<Visit> FIFO = Comparator.comparingLong(Visit::arrived).thenComparingLong(Visit::id);
    static final Comparator<Visit> EMERGENCY = Comparator.comparingInt(Visit::priority).reversed().thenComparing(FIFO);
    private final HashMap<Long, Boolean> availability = new HashMap<>();

    synchronized void updateAvailability(long doctorId, boolean available) {
        availability.put(doctorId, available); // average O(1) lookup/update
    }
    synchronized boolean isAvailable(long doctorId) { return availability.getOrDefault(doctorId, false); }

    long next(long doctorId, List<Visit> visits) {
        if (!isAvailable(doctorId)) return 0;
        Queue<Visit> normal = new ArrayDeque<>();
        PriorityQueue<Visit> emergencies = new PriorityQueue<>(EMERGENCY);
        // Snapshot is sorted to guarantee FIFO even if the database returns unordered rows.
        visits.stream().filter(v -> v.priority()==0).sorted(FIFO).forEach(normal::offer);
        visits.stream().filter(v -> v.priority()>0).forEach(emergencies::offer);
        Visit chosen = emergencies.isEmpty() ? normal.poll() : emergencies.poll();
        return chosen == null ? 0 : chosen.id();
    }

    public static void main(String[] args) throws Exception {
        Scheduler scheduler = new Scheduler();
        HttpServer server = HttpServer.create(new InetSocketAddress(8080), 0);
        server.createContext("/health", exchange -> {
            byte[] out = "ok".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200,out.length);exchange.getResponseBody().write(out);exchange.close();
        });
        server.createContext("/availability", exchange -> {
            int status=200;String result="";
            try {
                if(!exchange.getRequestMethod().equals("POST")) throw new IllegalArgumentException();
                byte[] raw=exchange.getRequestBody().readNBytes(262145);
                if(raw.length>262144) throw new IllegalArgumentException();
                String snapshot=new String(raw,StandardCharsets.UTF_8).strip();
                StringBuilder out=new StringBuilder();
                // Rebuild this read-through HashMap from durable doctor/visit state.
                synchronized(scheduler) {
                    scheduler.availability.clear();
                    if(!snapshot.isEmpty()) for(String line:snapshot.split("\\n")) {
                        String[] row=line.split("\\t");long id=Long.parseLong(row[0]);
                        if(row.length!=3||(!row[1].equals("true")&&!row[1].equals("false"))||(!row[2].equals("true")&&!row[2].equals("false"))) throw new IllegalArgumentException();
                        scheduler.updateAvailability(id,Boolean.parseBoolean(row[1])&&!Boolean.parseBoolean(row[2]));
                        out.append(id).append('\t').append(scheduler.isAvailable(id)).append('\n');
                    }
                }
                result=out.toString();
            }catch(Exception ex){status=400;result="invalid snapshot";}
            byte[] out=result.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status,out.length);exchange.getResponseBody().write(out);exchange.close();
        });
        server.createContext("/next", exchange -> {
            int status=200; String result;
            try {
                if (!exchange.getRequestMethod().equals("POST")) throw new IllegalArgumentException();
                byte[] raw=exchange.getRequestBody().readNBytes(262145);
                if(raw.length>262144) throw new IllegalArgumentException();
                String[] lines=new String(raw,StandardCharsets.UTF_8).strip().split("\\n");
                // Header: doctor ID and availability. Other lines: visit ID, priority, arrival epoch ms.
                String[] head=lines[0].split("\\t");
                long doctor=Long.parseLong(head[0]);
                if(!head[1].equals("true")&&!head[1].equals("false")) throw new IllegalArgumentException();
                List<Visit> visits=new ArrayList<>();
                for(int i=1;i<lines.length;i++) {
                    String[] row=lines[i].split("\\t");
                    int priority=Integer.parseInt(row[1]);
                    if(priority<0||priority>3) throw new IllegalArgumentException();
                    visits.add(new Visit(Long.parseLong(row[0]),priority,Long.parseLong(row[2])));
                }
                synchronized(scheduler) {
                    scheduler.updateAvailability(doctor,Boolean.parseBoolean(head[1]));
                    result=Long.toString(scheduler.next(doctor,visits));
                }
            } catch(Exception ex) {status=400;result="invalid snapshot";}
            byte[] out=result.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type","text/plain; charset=utf-8");
            exchange.sendResponseHeaders(status,out.length);exchange.getResponseBody().write(out);exchange.close();
        });
        server.setExecutor(Executors.newFixedThreadPool(4));server.start();
        System.out.println("Java scheduling service listening on 8080");
    }
}
