import java.util.List;
public class SchedulerTest {
    static void check(boolean value) {if(!value)throw new AssertionError();}
    public static void main(String[] args) {
        Scheduler s=new Scheduler();s.updateAvailability(1,true);
        check(s.next(1,List.of(new Scheduler.Visit(2,0,20),new Scheduler.Visit(1,0,10)))==1);
        check(s.next(1,List.of(new Scheduler.Visit(1,0,1),new Scheduler.Visit(2,2,2),new Scheduler.Visit(3,3,3)))==3);
        check(s.next(1,List.of(new Scheduler.Visit(4,2,10),new Scheduler.Visit(3,2,10)))==3);
        s.updateAvailability(1,false);check(s.next(1,List.of(new Scheduler.Visit(1,0,1)))==0);
        s.updateAvailability(1,true);check(s.next(1,List.of())==0);
        System.out.println("Java scheduler tests passed");
    }
}
