FROM eclipse-temurin:21-jdk
WORKDIR /app
COPY Scheduler.java SchedulerTest.java ./
RUN javac Scheduler.java SchedulerTest.java && java SchedulerTest
USER 10001
EXPOSE 8080
CMD ["java", "Scheduler"]
